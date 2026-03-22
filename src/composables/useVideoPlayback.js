/**
 * 儿童电视播放器 - 视频播放与 HLS 控制
 *
 * 职责：
 * - 管理 <video> 与 Hls.js 实例：普通 URL 用 video.src，百度 m3u8 用 Hls.loadSource + attachMedia
 * - 监听 currentUrl 变化，切换时销毁 Hls、设置 src 或重新挂载 Hls，并恢复进度/自动播放
 * - 进度保存与恢复：timeupdate 写回 seriesMeta/progressMap；开机/换台/换集时从 getChannelSavedProgress 恢复
 * - 音量、全屏、单集结束自动下一集、清空进度等
 *
 * 依赖：useKidsTvState, useSeriesBinding（getChannelSavedProgress, isBaiduM3u8Url）
 */

import Hls from "hls.js";
import { nextTick, ref, watch } from "vue";
import { message } from "ant-design-vue";
import {
  activeChannel,
  currentEpisodeLabel,
  currentPlaybackTime,
  currentSubtitleUrl,
  currentUrl,
  isPowerOn,
  persistState,
  runtimeSeriesMap,
  state,
} from "./useKidsTvState";
import {
  getChannelSavedProgress,
  isBaiduM3u8Url,
} from "./useSeriesBinding";

// ---------------------------------------------------------------------------
// Refs（单例）
// ---------------------------------------------------------------------------

/** <video> 元素引用，用于设置 src、currentTime、volume、播放等 */
export const videoRef = ref(null);

/** 屏幕容器引用，用于全屏 API */
export const screenFrameRef = ref(null);

/** 当前视频总时长（秒），用于底部展示 */
export const videoDuration = ref(0);

/** 是否处于全屏 */
export const isFullscreen = ref(false);

/** 音量 0～100 的整数值，用于面板展示 */
export const volumeLevel = ref(70);

/** Hls.js 实例，仅当当前源为百度 m3u8 时使用 */
export const hlsRef = ref(null);

/** 是否正在内部 seek（恢复进度），用于避免 timeupdate 误写 */
export const internalSeeking = ref(false);

/** 是否正在剧集切换中（上一集结束跳下一集），避免 timeupdate 写入错误集 */
export const isEpisodeTransitioning = ref(false);

/** 是否正在等待「恢复进度」的 seek 完成（刷新后 HLS 从 0 播会触发 timeupdate(0)，若此时保存会覆盖已恢复的进度） */
const restoreProgressPending = ref(false);

/** 用于单次 loadedmetadata 回调的引用，便于在下次恢复前移除，避免重复注册 */
export const pendingMetadataOnceHandler = ref(null);
export const pendingLoadedDataOnceHandler = ref(null);

/** 当前是否为百度 m3u8 源（不设 video.src，由 Hls 接管） */
export const useBaiduM3u8 = ref(false);

/** 是否有地址但视频尚未就绪（用于显示「加载中」） */
export const isVideoLoading = ref(false);
// 用 watch 同步，避免 composable 内 computed 依赖 useSeriesBinding 导致循环
watch(
  currentUrl,
  (url) => {
    useBaiduM3u8.value = isBaiduM3u8Url(url);
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 将秒数格式化为 MM:SS */
export function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 移除已注册的单次 loadedmetadata 监听，避免重复注册（供 App 卸载时清理） */
export function clearPendingMetadataListener(video) {
  if (!video || !pendingMetadataOnceHandler.value) return;
  video.removeEventListener("loadedmetadata", pendingMetadataOnceHandler.value);
  pendingMetadataOnceHandler.value = null;
}

/** 移除已注册的单次 loadeddata 监听（供 App 卸载时清理） */
export function clearPendingLoadedDataListener(video) {
  if (!video || !pendingLoadedDataOnceHandler.value) return;
  video.removeEventListener("loadeddata", pendingLoadedDataOnceHandler.value);
  pendingLoadedDataOnceHandler.value = null;
}

// ---------------------------------------------------------------------------
// 进度保存与恢复
// ---------------------------------------------------------------------------

/** 将当前 video.currentTime 写入 seriesMeta 或 progressMap，并持久化。剧集模式下同时写入 progressMap 作刷新后恢复的备用。 */
export function saveCurrentProgress() {
  const video = videoRef.value;
  if (!video) return;
  const channelId = activeChannel.value;
  const key = String(channelId);
  const seriesMeta = state.seriesMetaMap[key];
  const runtime = runtimeSeriesMap[key];
  const time = video.currentTime || 0;

  if (seriesMeta && runtime?.episodes?.length) {
    seriesMeta.currentEpisodeTime = time;
    state.progressMap[key] = time;
  } else {
    state.progressMap[key] = time;
  }
  persistState();
}

/** 选台：先保存当前台进度，再切换 activeChannel */
export function switchChannel(channelId) {
  if (channelId === activeChannel.value) return;
  saveCurrentProgress();
  activeChannel.value = channelId;
}

/** 若开机且有 URL，则设置音量并调用 video.play() */
export function tryAutoplayCurrent() {
  const video = videoRef.value;
  if (!video || !state.playback || !currentUrl.value) return;
  const vol = state.playback.volume;
  video.volume = vol;
  volumeLevel.value = Math.round(vol * 100);
  const playPromise = video.play();
  if (playPromise?.catch) playPromise.catch(() => {});
}

/** 设置音量并同步到 video 与面板展示，并持久化 */
export function applyVolume(nextVolume) {
  const safe = Math.min(Math.max(nextVolume, 0), 1);
  state.playback.volume = safe;
  const video = videoRef.value;
  if (video) {
    video.volume = safe;
    video.muted = safe === 0;
  }
  volumeLevel.value = Math.round(safe * 100);
  persistState();
}

/** 开机后根据已保存进度 seek，并注册 loadedmetadata 兜底 */
export function forceSeekToSavedProgress() {
  const video = videoRef.value;
  if (!video) return;
  clearPendingMetadataListener(video);
  const saved = getChannelSavedProgress(activeChannel.value);
  if (saved <= 0) return;

  internalSeeking.value = true;
  video.currentTime = saved;
  const onMetadata = () => {
    const maxTime = Number.isFinite(video.duration)
      ? Math.max(video.duration - 1, 0)
      : saved;
    video.currentTime = Math.min(saved, maxTime);
    window.setTimeout(() => {
      internalSeeking.value = false;
    }, 0);
  };
  pendingMetadataOnceHandler.value = onMetadata;
  video.addEventListener("loadedmetadata", onMetadata, { once: true });
}

/** 设置电源状态；关机会暂停并保存进度，开机会恢复进度并尝试自动播放 */
export function setPower(checked) {
  isPowerOn.value = checked;
  const video = videoRef.value;
  if (!video) return;
  if (!checked) {
    saveCurrentProgress();
    video.pause();
    return;
  }
  nextTick(() => {
    forceSeekToSavedProgress();
    restoreProgressForCurrentChannel();
  });
}

/**
 * 根据当前频道已保存进度恢复 currentTime，并在合适时机尝试自动播放。
 * 若 saved<=0 仅尝试播放；否则在 loadedmetadata/loadeddata 后 seek 再播放。
 */
export function restoreProgressForCurrentChannel() {
  const video = videoRef.value;
  if (!video || !currentUrl.value) return;
  if (video._restoreFallbackId != null) {
    clearTimeout(video._restoreFallbackId);
    video._restoreFallbackId = null;
  }
  clearPendingMetadataListener(video);
  clearPendingLoadedDataListener(video);
  const saved = getChannelSavedProgress(activeChannel.value);

  if (saved <= 0) {
    restoreProgressPending.value = false;
    if (isPowerOn.value) {
      if (video.readyState >= 2) {
        tryAutoplayCurrent();
      } else {
        const onLoadedData = () => {
          pendingLoadedDataOnceHandler.value = null;
          tryAutoplayCurrent();
        };
        pendingLoadedDataOnceHandler.value = onLoadedData;
        video.addEventListener("loadeddata", onLoadedData, { once: true });
      }
    }
    return;
  }

  const applyRestore = () => {
    restoreProgressPending.value = false;
    if (video._restoreFallbackId != null) {
      clearTimeout(video._restoreFallbackId);
      video._restoreFallbackId = null;
    }
    const maxTime = Number.isFinite(video.duration)
      ? Math.max(video.duration - 1, 0)
      : saved;
    internalSeeking.value = true;
    const targetTime = Math.min(saved, maxTime);
    video.currentTime = targetTime;
    if (isPowerOn.value) tryAutoplayCurrent();
    window.setTimeout(() => {
      internalSeeking.value = false;
    }, 0);
  };

  if (video.readyState >= 1) {
    restoreProgressPending.value = false;
    applyRestore();
  } else {
    restoreProgressPending.value = true;
    const onMetadata = () => {
      pendingMetadataOnceHandler.value = null;
      applyRestore();
    };
    pendingMetadataOnceHandler.value = onMetadata;
    video.addEventListener("loadedmetadata", onMetadata, { once: true });
  }

  // HLS 等流式源可能较晚才就绪或首次 seek 未生效，延迟再次恢复进度
  const fallbackMs = 1800;
  const fallbackId = window.setTimeout(() => {
    restoreProgressPending.value = false;
    if (!videoRef.value || videoRef.value !== video) return;
    const current = getChannelSavedProgress(activeChannel.value);
    if (current > 0 && video.currentTime < 1) {
      const maxTime = Number.isFinite(video.duration)
        ? Math.max(video.duration - 1, 0)
        : current;
      internalSeeking.value = true;
      video.currentTime = Math.min(current, maxTime);
      window.setTimeout(() => {
        internalSeeking.value = false;
      }, 0);
    }
  }, fallbackMs);
  video._restoreFallbackId = fallbackId;
}

// ---------------------------------------------------------------------------
// 事件处理
// ---------------------------------------------------------------------------

export function onTimeUpdate() {
  const video = videoRef.value;
  if (!video || video.ended || isEpisodeTransitioning.value) return;
  if (restoreProgressPending.value) return;
  saveCurrentProgress();
}

export function onLoadedMetadata() {
  const video = videoRef.value;
  if (!video) return;
  videoDuration.value = Number.isFinite(video.duration) ? video.duration : 0;
  isVideoLoading.value = false;
}

export function increaseVolume() {
  applyVolume(state.playback.volume + 0.1);
}

export function decreaseVolume() {
  applyVolume(state.playback.volume - 0.1);
}

export function toggleFullscreen() {
  const frame = screenFrameRef.value;
  if (!frame) return;
  if (!document.fullscreenElement) {
    frame.requestFullscreen?.();
    return;
  }
  document.exitFullscreen?.();
}

export function onFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

/** 当前集播完：若还有下一集则切到下一集并恢复进度；否则仅清零当前台进度 */
export function onVideoEnded() {
  const channelId = activeChannel.value;
  const seriesMeta = state.seriesMetaMap[channelId];
  const runtime = runtimeSeriesMap[channelId];
  if (seriesMeta && runtime?.episodes?.length) {
    const idx = Math.max(Number(seriesMeta.currentEpisodeIndex || 0), 0);
    seriesMeta.currentEpisodeTime = 0;
    if (idx < runtime.episodes.length - 1) {
      isEpisodeTransitioning.value = true;
      seriesMeta.currentEpisodeIndex = idx + 1;
      seriesMeta.currentEpisodeTime = 0;
      persistState();
      nextTick(() => {
        videoDuration.value = 0;
        restoreProgressForCurrentChannel();
      });
      return;
    }
    persistState();
    return;
  }

  state.progressMap[channelId] = 0;
  persistState();
}

/** 清空指定频道的播放进度与剧集进度，并提示 */
export function resetProgress(channelId) {
  state.progressMap[channelId] = 0;
  const seriesMeta = state.seriesMetaMap[channelId];
  if (seriesMeta?.episodeNames?.length) {
    seriesMeta.currentEpisodeIndex = 0;
    seriesMeta.currentEpisodeTime = 0;
  }
  if (channelId === activeChannel.value && videoRef.value) {
    videoRef.value.currentTime = 0;
  }
  persistState();
  message.success(`已清空 ${channelId} 号台播放记录`);
}

// ---------------------------------------------------------------------------
// HLS
// ---------------------------------------------------------------------------

export function destroyHls() {
  if (hlsRef.value) {
    hlsRef.value.destroy();
    hlsRef.value = null;
  }
}

export function setupHlsForM3u8(url) {
  const video = videoRef.value;
  if (!video || !url) return;
  destroyHls();
  if (!Hls.isSupported()) {
    video.src = url;
    return;
  }
  const hls = new Hls({
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  });
  hlsRef.value = hls;
  hls.loadSource(url);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (_ev, data) => {
    if (data.fatal) {
      destroyHls();
      video.src = url;
      isVideoLoading.value = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Watch：currentUrl 变化时切换 HLS / src，并恢复进度
// ---------------------------------------------------------------------------

watch(currentUrl, async (url) => {
  isVideoLoading.value = !!url;
  destroyHls();
  const video = videoRef.value;
  if (video) {
    video.src = "";
    if (isBaiduM3u8Url(url)) {
      await nextTick();
      setupHlsForM3u8(url);
    } else if (url) {
      video.src = url;
    }
  }
  await nextTick();
  videoDuration.value = 0;
  restoreProgressForCurrentChannel();
  window.setTimeout(() => {
    isEpisodeTransitioning.value = false;
  }, 200);
});

watch(
  () => state.playback,
  () => {
    persistState();
    applyVolume(state.playback.volume);
  },
  { deep: true }
);

// 导出供模板使用的只读引用（与 useKidsTvState 保持一致）
export {
  currentUrl,
  currentSubtitleUrl,
  currentPlaybackTime,
  currentEpisodeLabel,
};
