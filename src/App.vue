<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import { message } from "ant-design-vue";
import { defaultChannelUrls } from "./data/defaultChannels";

const STORAGE_KEY = "kids-tv-player-state-v2";
const CHANNEL_COUNT = 10;
const VIDEO_EXTENSIONS = [".mp4", ".m4v", ".webm", ".mov", ".mkv"];
const SUBTITLE_EXTENSIONS = [".srt"];
const LEGO_COLORS = [
  "#ff4d4f",
  "#fa8c16",
  "#fadb14",
  "#52c41a",
  "#13c2c2",
  "#1677ff",
  "#722ed1",
  "#eb2f96",
  "#d46b08",
  "#2f54eb",
];

const videoRef = ref(null);
const activeChannel = ref(1);
const isPowerOn = ref(false);
const settingsVisible = ref(false);
const challengeVisible = ref(false);
const internalSeeking = ref(false);
const isEpisodeTransitioning = ref(false);
const pendingMetadataOnceHandler = ref(null);
const pendingLoadedDataOnceHandler = ref(null);
const screenFrameRef = ref(null);
const videoDuration = ref(0);
const isFullscreen = ref(false);
const volumeLevel = ref(70);
const challengeInput = ref("");
const challengeError = ref("");
const challengeState = reactive({
  expression: "",
  answer: 0,
});

const runtimeSeriesMap = reactive({});

const state = reactive({
  channelUrls: [...defaultChannelUrls],
  progressMap: {},
  seriesMetaMap: {},
  playback: {
    volume: 0.7,
    bigKidMode: false,
  },
});

const channelItems = computed(() =>
  Array.from({ length: CHANNEL_COUNT }, (_, i) => ({
    id: i + 1,
    color: LEGO_COLORS[i % LEGO_COLORS.length],
  }))
);

const currentSeriesRuntime = computed(
  () => runtimeSeriesMap[activeChannel.value] || null
);
const currentSeriesMeta = computed(
  () => state.seriesMetaMap[activeChannel.value] || null
);
const currentEpisodeIndex = computed(() =>
  Math.max(Number(currentSeriesMeta.value?.currentEpisodeIndex || 0), 0)
);

const currentUrl = computed(() => {
  if (currentSeriesRuntime.value?.episodes?.length) {
    return (
      currentSeriesRuntime.value.episodes[currentEpisodeIndex.value]?.url || ""
    );
  }
  return state.channelUrls[activeChannel.value - 1] || "";
});

const currentPlaybackTime = computed(() => {
  if (currentSeriesMeta.value) {
    return Number(currentSeriesMeta.value.currentEpisodeTime || 0);
  }
  return Number(state.progressMap[activeChannel.value] || 0);
});
const currentSubtitleUrl = computed(() => {
  if (!currentSeriesRuntime.value?.episodes?.length) return "";
  return currentSeriesRuntime.value.episodes[currentEpisodeIndex.value]?.subtitleUrl || "";
});

const currentEpisodeLabel = computed(() => {
  if (!currentSeriesMeta.value) return "";
  const episodeName =
    currentSeriesMeta.value.episodeNames?.[currentEpisodeIndex.value] || "";
  return `第 ${currentEpisodeIndex.value + 1} 集 ${episodeName}`;
});

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeSeriesMeta(meta) {
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

  return {
    seriesName:
      typeof meta.seriesName === "string" ? meta.seriesName : "未命名节目",
    episodeNames,
    currentEpisodeIndex,
    currentEpisodeTime,
  };
}

function persistState() {
  const payload = {
    channelUrls: state.channelUrls,
    progressMap: state.progressMap,
    seriesMetaMap: state.seriesMetaMap,
    playback: state.playback,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
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
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function generateChallenge() {
  while (true) {
    const a = Math.floor(Math.random() * 100);
    const b = Math.floor(Math.random() * 100);
    const c = Math.floor(Math.random() * 100);
    const usePlusFirst = Math.random() > 0.5;
    const usePlusSecond = Math.random() > 0.5;
    let result = usePlusFirst ? a + b : a - b;
    result = usePlusSecond ? result + c : result - c;
    if (result >= 0 && result <= 100) {
      challengeState.answer = result;
      challengeState.expression = `${a} ${usePlusFirst ? "+" : "-"} ${b} ${
        usePlusSecond ? "+" : "-"
      } ${c} = ?`;
      return;
    }
  }
}

function openChallenge() {
  challengeInput.value = "";
  challengeError.value = "";
  generateChallenge();
  challengeVisible.value = true;
}

function verifyChallenge() {
  if (Number(challengeInput.value) === challengeState.answer) {
    challengeVisible.value = false;
    settingsVisible.value = true;
    return;
  }
  challengeError.value = "答案不对，再想一想哦。";
}

function releaseSeriesUrls(channelId) {
  const runtime = runtimeSeriesMap[channelId];
  if (!runtime?.episodes?.length) return;
  runtime.episodes.forEach((episode) => {
    URL.revokeObjectURL(episode.url);
    if (episode.subtitleUrl) {
      URL.revokeObjectURL(episode.subtitleUrl);
    }
  });
  delete runtimeSeriesMap[channelId];
}

function extractEpisodeNo(fileName) {
  const rules = [/第\s*(\d+)\s*[集话]/i, /(?:ep|e)\s*0*(\d+)/i, /(\d{1,4})/i];
  for (const regex of rules) {
    const match = fileName.match(regex);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function isVideoFile(fileName) {
  const lower = fileName.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isSubtitleFile(fileName) {
  const lower = fileName.toLowerCase();
  return SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getFileStem(fileName) {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0) return fileName;
  return fileName.slice(0, idx);
}

function normalizeFileStem(fileName) {
  return getFileStem(fileName).toLowerCase().replace(/\s+/g, "");
}

function srtToVtt(srtText) {
  const text = String(srtText || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${text}`;
}

function naturalNameCompare(a, b) {
  return a.localeCompare(b, "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

async function bindSeriesFolder(channelId) {
  if (!window.showDirectoryPicker) {
    message.error("当前浏览器不支持文件夹选择，请使用 Chrome/Edge。");
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker();

    const videoFiles = [];
    const subtitleFileMap = new Map();
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== "file") continue;
      const file = await entry.getFile();
      if (isVideoFile(entry.name)) {
        videoFiles.push(file);
        continue;
      }
      if (isSubtitleFile(entry.name)) {
        subtitleFileMap.set(normalizeFileStem(entry.name), file);
      }
    }

    const episodesRaw = [];
    for (const videoFile of videoFiles) {
      const subtitleFile = subtitleFileMap.get(normalizeFileStem(videoFile.name));
      let subtitleUrl = "";
      if (subtitleFile) {
        const vttText = srtToVtt(await subtitleFile.text());
        subtitleUrl = URL.createObjectURL(new Blob([vttText], { type: "text/vtt" }));
      }
      episodesRaw.push({
        name: videoFile.name,
        episodeNo: extractEpisodeNo(videoFile.name),
        url: URL.createObjectURL(videoFile),
        subtitleUrl,
      });
    }

    if (!episodesRaw.length) {
      message.warning("该文件夹没有可识别的视频文件。");
      return;
    }

    episodesRaw.sort((a, b) => {
      const aHasNo = Number.isFinite(a.episodeNo);
      const bHasNo = Number.isFinite(b.episodeNo);
      if (aHasNo && bHasNo) return a.episodeNo - b.episodeNo;
      if (aHasNo) return -1;
      if (bHasNo) return 1;
      return naturalNameCompare(a.name, b.name);
    });

    releaseSeriesUrls(channelId);
    runtimeSeriesMap[channelId] = { episodes: episodesRaw };

    const previousMeta = state.seriesMetaMap[channelId];
    const episodeNames = episodesRaw.map((item) => item.name);
    const sameSeries =
      previousMeta?.seriesName === (dirHandle.name || `频道 ${channelId}`);
    const currentEpisodeIndex = sameSeries
      ? Math.min(
          Math.max(Number(previousMeta?.currentEpisodeIndex || 0), 0),
          episodeNames.length - 1
        )
      : 0;
    const currentEpisodeTime = sameSeries
      ? Math.max(Number(previousMeta?.currentEpisodeTime || 0), 0)
      : 0;

    state.seriesMetaMap[channelId] = {
      seriesName: dirHandle.name || `频道 ${channelId}`,
      episodeNames,
      currentEpisodeIndex,
      currentEpisodeTime,
    };
    persistState();
    const subtitleCount = episodesRaw.filter((item) => item.subtitleUrl).length;
    message.success(
      `${channelId} 号台已绑定：${dirHandle.name}（${episodeNames.length} 集，字幕 ${subtitleCount} 集）`
    );

    if (channelId === activeChannel.value) {
      await nextTick();
      videoDuration.value = 0;
      restoreProgressForCurrentChannel();
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    message.error("绑定文件夹失败，请重试。");
  }
}

function clearSeries(channelId) {
  releaseSeriesUrls(channelId);
  delete state.seriesMetaMap[channelId];
  persistState();
  message.success(`已清空 ${channelId} 号台剧集绑定`);
}

function getChannelSavedProgress(channelId) {
  const seriesMeta = state.seriesMetaMap[channelId];
  const runtime = runtimeSeriesMap[channelId];
  if (seriesMeta && runtime?.episodes?.length) {
    return Number(seriesMeta.currentEpisodeTime || 0);
  }
  return Number(state.progressMap[channelId] || 0);
}

function getChannelProgressForDisplay(channelId) {
  return getChannelSavedProgress(channelId);
}

function saveCurrentProgress() {
  const video = videoRef.value;
  if (!video) return;
  const channelId = activeChannel.value;
  const seriesMeta = state.seriesMetaMap[channelId];
  const runtime = runtimeSeriesMap[channelId];

  if (seriesMeta && runtime?.episodes?.length) {
    seriesMeta.currentEpisodeTime = video.currentTime || 0;
  } else {
    state.progressMap[channelId] = video.currentTime || 0;
  }
  persistState();
}

function switchChannel(channelId) {
  if (channelId === activeChannel.value) return;
  saveCurrentProgress();
  activeChannel.value = channelId;
}

function tryAutoplayCurrent() {
  const video = videoRef.value;
  if (!video || !isPowerOn.value || !currentUrl.value) return;
  video.volume = state.playback.volume;
  volumeLevel.value = Math.round(state.playback.volume * 100);
  const playPromise = video.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {});
  }
}

function clearPendingMetadataListener(video) {
  if (!video || !pendingMetadataOnceHandler.value) return;
  video.removeEventListener("loadedmetadata", pendingMetadataOnceHandler.value);
  pendingMetadataOnceHandler.value = null;
}

function clearPendingLoadedDataListener(video) {
  if (!video || !pendingLoadedDataOnceHandler.value) return;
  video.removeEventListener("loadeddata", pendingLoadedDataOnceHandler.value);
  pendingLoadedDataOnceHandler.value = null;
}

function forceSeekToSavedProgress() {
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

function setPower(checked) {
  isPowerOn.value = checked;
  if (!videoRef.value) return;
  if (!checked) {
    saveCurrentProgress();
    videoRef.value.pause();
    return;
  }
  nextTick(() => {
    forceSeekToSavedProgress();
    restoreProgressForCurrentChannel();
  });
}

function restoreProgressForCurrentChannel() {
  const video = videoRef.value;
  if (!video || !currentUrl.value) return;
  clearPendingMetadataListener(video);
  clearPendingLoadedDataListener(video);
  const saved = getChannelSavedProgress(activeChannel.value);

  if (saved <= 0) {
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
    const maxTime = Number.isFinite(video.duration)
      ? Math.max(video.duration - 1, 0)
      : saved;
    internalSeeking.value = true;
    video.currentTime = Math.min(saved, maxTime);
    if (isPowerOn.value) {
      tryAutoplayCurrent();
    }
    window.setTimeout(() => {
      internalSeeking.value = false;
    }, 0);
  };

  if (video.readyState >= 1) {
    applyRestore();
  } else {
    const onMetadata = () => {
      pendingMetadataOnceHandler.value = null;
      applyRestore();
    };
    pendingMetadataOnceHandler.value = onMetadata;
    video.addEventListener("loadedmetadata", onMetadata, { once: true });
  }
}

function onTimeUpdate() {
  const video = videoRef.value;
  if (!video) return;
  if (video.ended) return;
  if (isEpisodeTransitioning.value) return;
  saveCurrentProgress();
}

function onLoadedMetadata() {
  const video = videoRef.value;
  if (!video) return;
  videoDuration.value = Number.isFinite(video.duration) ? video.duration : 0;
}

function applyVolume(nextVolume) {
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

function increaseVolume() {
  applyVolume(state.playback.volume + 0.1);
}

function decreaseVolume() {
  applyVolume(state.playback.volume - 0.1);
}

function toggleFullscreen() {
  const frame = screenFrameRef.value;
  if (!frame) return;
  if (!document.fullscreenElement) {
    frame.requestFullscreen?.();
    return;
  }
  document.exitFullscreen?.();
}

function onFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function onVideoEnded() {
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

function resetProgress(channelId) {
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

watch(
  () => state.channelUrls,
  () => {
    persistState();
  },
  { deep: true }
);

watch(
  () => state.seriesMetaMap,
  () => {
    persistState();
  },
  { deep: true }
);

watch(currentUrl, async () => {
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

onMounted(() => {
  loadState();
  volumeLevel.value = Math.round(state.playback.volume * 100);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  nextTick(() => {
    applyVolume(state.playback.volume);
    restoreProgressForCurrentChannel();
    tryAutoplayCurrent();
  });
});

onUnmounted(() => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  clearPendingMetadataListener(videoRef.value);
  clearPendingLoadedDataListener(videoRef.value);
  Object.keys(runtimeSeriesMap).forEach((channelId) => {
    releaseSeriesUrls(channelId);
  });
});
</script>

<template>
  <div class="page">
    <div class="console-layout">
      <div ref="screenFrameRef" class="screen-frame">
        <template v-if="currentUrl">
          <video
            ref="videoRef"
            class="player"
            :controls="state.playback.bigKidMode"
            :autoplay="isPowerOn"
            :src="currentUrl"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @ended="onVideoEnded"
          >
            <track
              v-if="currentSubtitleUrl"
              kind="subtitles"
              srclang="zh"
              label="中文字幕"
              :src="currentSubtitleUrl"
              default
            />
          </video>
          <div
            v-if="isPowerOn && !state.playback.bigKidMode"
            class="screen-overlay-controls"
          >
            <span v-if="currentEpisodeLabel" class="episode-chip">{{
              currentEpisodeLabel
            }}</span>
            <span class="time-chip">
              {{ formatTime(currentPlaybackTime) }}/{{
                formatTime(videoDuration)
              }}
            </span>
            <button
              class="fullscreen-chip"
              type="button"
              @click="toggleFullscreen"
            >
              {{ isFullscreen ? "退出全屏" : "全屏" }}
            </button>
          </div>
          <div v-if="!isPowerOn" class="off-screen">
            <div>电视已关闭</div>
            <div>打开电源后自动播放当前频道</div>
          </div>
        </template>
        <div v-else class="empty-screen">
          <div>当前频道暂无可播放内容</div>
          <div>请在家长设置中填写链接或绑定本地文件夹</div>
        </div>
      </div>

      <aside class="control-panel">
        <div class="power-wrap">
          <span class="power-led" :class="{ on: isPowerOn }"></span>
          <button
            class="power-switch"
            :class="{ on: isPowerOn }"
            type="button"
            :aria-label="isPowerOn ? '关闭电视' : '打开电视'"
            @click="setPower(!isPowerOn)"
          >
            <span class="power-track"></span>
            <span class="power-thumb"></span>
          </button>
        </div>
        <div class="volume-wrap">
          <button class="volume-btn" type="button" @click="decreaseVolume">
            -
          </button>
          <div class="volume-display">VOL {{ volumeLevel }}</div>
          <button class="volume-btn" type="button" @click="increaseVolume">
            +
          </button>
        </div>
        <div class="channel-board-on-tv">
          <button
            v-for="item in channelItems"
            :key="item.id"
            class="channel-btn"
            :class="{ active: item.id === activeChannel }"
            :style="{ '--lego-color': item.color }"
            @click="switchChannel(item.id)"
          >
            {{ item.id }}
            <span class="progress-tag">{{
              formatTime(getChannelProgressForDisplay(item.id))
            }}</span>
          </button>
        </div>
        <button
          class="parent-icon-btn"
          type="button"
          aria-label="家长设置"
          @click="openChallenge"
        >
          ⚙
        </button>
      </aside>
    </div>
  </div>

  <a-modal
    v-model:open="challengeVisible"
    title="家长验证"
    :ok-text="'验证'"
    :cancel-text="'取消'"
    @ok="verifyChallenge"
  >
    <p class="challenge-text">请回答：{{ challengeState.expression }}</p>
    <a-input
      v-model:value="challengeInput"
      inputmode="numeric"
      placeholder="请输入答案"
      @pressEnter="verifyChallenge"
    />
    <p v-if="challengeError" class="error-text">{{ challengeError }}</p>
  </a-modal>

  <a-drawer
    v-model:open="settingsVisible"
    title="家长模式 - 频道设置"
    width="700"
    :destroy-on-close="false"
  >
    <div class="setting-desc">
      每个频道可配置在线视频链接，也可绑定本地动画文件夹（Chromium
      浏览器可用）。
    </div>
    <div class="playback-setting-row">
      <span>大童模式（显示播放器 controls）</span>
      <a-switch v-model:checked="state.playback.bigKidMode" />
    </div>
    <div
      v-for="item in channelItems"
      :key="`setting-${item.id}`"
      class="setting-block"
    >
      <div class="setting-row">
        <div class="setting-label">{{ item.id }} 号台</div>
        <a-input
          v-model:value="state.channelUrls[item.id - 1]"
          :placeholder="`请输入 ${item.id} 号台视频链接`"
        />
        <a-button danger @click="resetProgress(item.id)">清空进度</a-button>
      </div>
      <div class="series-row">
        <a-button @click="bindSeriesFolder(item.id)">绑定本地文件夹</a-button>
        <span class="series-meta" v-if="state.seriesMetaMap[item.id]">
          {{ state.seriesMetaMap[item.id].seriesName }} ·
          {{ state.seriesMetaMap[item.id].episodeNames.length }} 集 · 当前第
          {{ state.seriesMetaMap[item.id].currentEpisodeIndex + 1 }} 集
        </span>
        <a-button
          v-if="state.seriesMetaMap[item.id]"
          danger
          @click="clearSeries(item.id)"
        >
          清空剧集
        </a-button>
      </div>
    </div>
  </a-drawer>
</template>
