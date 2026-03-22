/**
 * 儿童电视播放器 - 全局状态与持久化
 *
 * 职责：
 * - 维护频道链接、单集进度、剧集元信息、播放设置等核心状态
 * - 提供与当前选台相关的计算属性（当前 URL、当前集信息、进度等）
 * - 负责将状态写入 localStorage 与从 localStorage 恢复，并做兼容性归一化
 *
 * 注意：本 composable 在模块内持有单例 ref/reactive，多处导入将得到同一份状态。
 */

import { computed, reactive, ref, watch } from "vue";
import { CHANNEL_COUNT, LEGO_COLORS, STORAGE_KEY } from "../constants";
import { defaultChannelUrls } from "../data/defaultChannels";

// ---------------------------------------------------------------------------
// 响应式状态（单例）
// ---------------------------------------------------------------------------

/** 当前选中的频道号（1～CHANNEL_COUNT） */
export const activeChannel = ref(1);

/** 电视电源状态：true 为开机（可播放），false 为关机（黑屏提示） */
export const isPowerOn = ref(false);

/** 家长设置抽屉是否打开 */
export const settingsVisible = ref(false);

/**
 * 各频道当前加载的「剧集运行时」：由绑定本地文件夹或百度网盘后写入。
 * 结构：{ [channelId]: { episodes: Array<{ name, url, subtitleUrl?, episodeNo?, path? }> } }
 * 与 seriesMetaMap 配合：meta 存进度与集序号，runtime 存当前会话的播放列表。
 */
export const runtimeSeriesMap = reactive({});

/**
 * 持久化状态：频道链接、单台进度、剧集元信息、播放设置。
 * - channelUrls: 每台一个在线视频链接（未绑定剧集时使用）
 * - progressMap: 单台模式下的播放进度（秒）
 * - seriesMetaMap: 剧集模式下的元信息（剧名、集名列表、当前集索引、当前集内时间等）
 * - playback: 音量、大童模式等
 */
export const state = reactive({
  channelUrls: [...defaultChannelUrls],
  progressMap: {},
  seriesMetaMap: {},
  playback: {
    volume: 0.7,
    bigKidMode: false,
  },
});

// ---------------------------------------------------------------------------
// 计算属性：当前频道对应的剧集与播放源
// ---------------------------------------------------------------------------

/** 当前频道的剧集运行时（episodes 数组），无绑定则为 null */
export const currentSeriesRuntime = computed(
  () => runtimeSeriesMap[activeChannel.value] || null
);

/** 当前频道的剧集元信息（剧名、集名、当前集索引、当前集内时间等） */
export const currentSeriesMeta = computed(
  () => state.seriesMetaMap[activeChannel.value] || null
);

/** 当前正在播放的集数索引（0-based） */
export const currentEpisodeIndex = computed(() =>
  Math.max(Number(currentSeriesMeta.value?.currentEpisodeIndex || 0), 0)
);

/**
 * 当前应播放的媒体 URL。
 * 剧集模式下取当前集的 url；否则取该频道的 channelUrls 项。
 */
export const currentUrl = computed(() => {
  if (currentSeriesRuntime.value?.episodes?.length) {
    return (
      currentSeriesRuntime.value.episodes[currentEpisodeIndex.value]?.url || ""
    );
  }
  return state.channelUrls[activeChannel.value - 1] || "";
});

/** 当前频道已播放时间（秒），用于底部展示与进度恢复 */
export const currentPlaybackTime = computed(() => {
  if (currentSeriesMeta.value) {
    return Number(currentSeriesMeta.value.currentEpisodeTime || 0);
  }
  return Number(state.progressMap[activeChannel.value] || 0);
});

/** 当前集字幕 URL（VTT），无则空字符串 */
export const currentSubtitleUrl = computed(() => {
  if (!currentSeriesRuntime.value?.episodes?.length) return "";
  return (
    currentSeriesRuntime.value.episodes[currentEpisodeIndex.value]
      ?.subtitleUrl || ""
  );
});

/** 用于 UI 展示的「第 N 集 剧集名」 */
export const currentEpisodeLabel = computed(() => {
  if (!currentSeriesMeta.value) return "";
  const episodeName =
    currentSeriesMeta.value.episodeNames?.[currentEpisodeIndex.value] || "";
  return `第 ${currentEpisodeIndex.value + 1} 集 ${episodeName}`;
});

/** 频道按钮列表（id + 乐高色），用于右侧选台与设置中的频道列表 */
export const channelItems = computed(() =>
  Array.from({ length: CHANNEL_COUNT }, (_, i) => ({
    id: i + 1,
    color: LEGO_COLORS[i % LEGO_COLORS.length],
  }))
);

// ---------------------------------------------------------------------------
// 剧集元信息归一化（兼容旧版 episodeProgress 结构）
// ---------------------------------------------------------------------------

/**
 * 将持久化中的剧集元信息归一化为统一结构，并做边界校验。
 * 百度网盘源会保留 episodePaths，用于刷新后恢复播放列表。
 * @param {unknown} meta - 从 localStorage 解析出的单个频道 meta
 * @returns {object | null} 合法则返回 { seriesName, episodeNames, currentEpisodeIndex, currentEpisodeTime [, source] [, episodePaths] }，否则 null
 */
export function normalizeSeriesMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const episodeNames = Array.isArray(meta.episodeNames)
    ? meta.episodeNames.filter((item) => typeof item === "string")
    : [];
  if (!episodeNames.length) return null;

  const currentEpisodeIndex = Math.min(
    Math.max(Number(meta.currentEpisodeIndex || 0), 0),
    episodeNames.length - 1
  );
  const legacyProgress =
    meta.episodeProgress && typeof meta.episodeProgress === "object"
      ? Number(meta.episodeProgress[currentEpisodeIndex] || 0)
      : 0;
  const currentEpisodeTime = Number.isFinite(meta.currentEpisodeTime)
    ? Math.max(Number(meta.currentEpisodeTime), 0)
    : Math.max(legacyProgress, 0);

  const result = {
    seriesName:
      typeof meta.seriesName === "string" ? meta.seriesName : "未命名节目",
    episodeNames,
    currentEpisodeIndex,
    currentEpisodeTime,
    ...(meta.source && typeof meta.source === "object" ? { source: meta.source } : {}),
  };
  // 百度网盘：保留每集 path 列表，刷新后用于恢复 runtimeSeriesMap
  if (
    Array.isArray(meta.episodePaths) &&
    meta.episodePaths.length === episodeNames.length &&
    meta.episodePaths.every((p) => typeof p === "string")
  ) {
    result.episodePaths = meta.episodePaths;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 持久化
// ---------------------------------------------------------------------------

/** 将当前 state 与选台/电源写入 localStorage（刷新后恢复播放进度与当前频道）。 */
export function persistState() {
  const payload = {
    channelUrls: state.channelUrls,
    progressMap: state.progressMap,
    seriesMetaMap: state.seriesMetaMap,
    playback: state.playback,
    activeChannel: activeChannel.value,
    isPowerOn: isPowerOn.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** 从 localStorage 读取并恢复 state，对 seriesMetaMap 做归一化 */
export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed.channelUrls) &&
      parsed.channelUrls.length === CHANNEL_COUNT
    ) {
      state.channelUrls = parsed.channelUrls.map((url) =>
        typeof url === "string" ? url : ""
      );
    }
    if (parsed.progressMap && typeof parsed.progressMap === "object") {
      state.progressMap = parsed.progressMap;
    }
    if (parsed.seriesMetaMap && typeof parsed.seriesMetaMap === "object") {
      const normalized = {};
      Object.entries(parsed.seriesMetaMap).forEach(([channelId, meta]) => {
        const valid = normalizeSeriesMeta(meta);
        if (valid) normalized[channelId] = valid;
      });
      state.seriesMetaMap = normalized;
    }
    if (parsed.playback && typeof parsed.playback === "object") {
      if (Number.isFinite(parsed.playback.volume)) {
        state.playback.volume = Math.min(
          Math.max(Number(parsed.playback.volume), 0),
          1
        );
      }
      if (typeof parsed.playback.bigKidMode === "boolean") {
        state.playback.bigKidMode = parsed.playback.bigKidMode;
      }
    }
    if (Number.isInteger(parsed.activeChannel) && parsed.activeChannel >= 1 && parsed.activeChannel <= CHANNEL_COUNT) {
      activeChannel.value = parsed.activeChannel;
    }
    if (typeof parsed.isPowerOn === "boolean") {
      isPowerOn.value = parsed.isPowerOn;
    }
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// 状态变更时自动持久化
watch(
  () => state.channelUrls,
  () => persistState(),
  { deep: true }
);
watch(
  () => state.seriesMetaMap,
  () => persistState(),
  { deep: true }
);
watch([activeChannel, isPowerOn], () => persistState());
