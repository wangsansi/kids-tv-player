<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { defaultChannelUrls } from "./data/defaultChannels";

const STORAGE_KEY = "kids-tv-player-state-v1";
const CHANNEL_COUNT = 10;
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

const state = reactive({
  channelUrls: [...defaultChannelUrls],
  progressMap: {},
  playback: {
    volume: 0.7,
  },
});

const channelItems = computed(() =>
  Array.from({ length: CHANNEL_COUNT }, (_, i) => ({
    id: i + 1,
    color: LEGO_COLORS[i % LEGO_COLORS.length],
  })),
);

const currentUrl = computed(() => state.channelUrls[activeChannel.value - 1] || "");

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function persistState() {
  const payload = {
    channelUrls: state.channelUrls,
    progressMap: state.progressMap,
    playback: state.playback,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.channelUrls) && parsed.channelUrls.length === CHANNEL_COUNT) {
      state.channelUrls = parsed.channelUrls.map((url) => (typeof url === "string" ? url : ""));
    }
    if (parsed.progressMap && typeof parsed.progressMap === "object") {
      state.progressMap = parsed.progressMap;
    }
    if (parsed.playback && typeof parsed.playback === "object") {
      if (Number.isFinite(parsed.playback.volume)) {
        state.playback.volume = Math.min(Math.max(Number(parsed.playback.volume), 0), 1);
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

function saveCurrentProgress() {
  const video = videoRef.value;
  if (!video) return;
  state.progressMap[activeChannel.value] = video.currentTime || 0;
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

function forceSeekToSavedProgress() {
  const video = videoRef.value;
  if (!video) return;
  const saved = Number(state.progressMap[activeChannel.value] || 0);
  if (saved <= 0) return;

  // 开机兜底：先立即 seek 一次，再在元数据就绪后再 seek 一次，避免回到 00:00。
  internalSeeking.value = true;
  video.currentTime = saved;
  const onMetadata = () => {
    const maxTime = Number.isFinite(video.duration) ? Math.max(video.duration - 1, 0) : saved;
    video.currentTime = Math.min(saved, maxTime);
    window.setTimeout(() => {
      internalSeeking.value = false;
    }, 0);
  };
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
  const saved = Number(state.progressMap[activeChannel.value] || 0);
  if (saved <= 0) {
    if (isPowerOn.value) {
      if (video.readyState >= 2) {
        tryAutoplayCurrent();
      } else {
        video.addEventListener("loadeddata", tryAutoplayCurrent, { once: true });
      }
    }
    return;
  }
  const applyRestore = () => {
    const maxTime = Number.isFinite(video.duration) ? Math.max(video.duration - 1, 0) : saved;
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
    video.addEventListener("loadedmetadata", applyRestore, { once: true });
  }
}

function onTimeUpdate() {
  const video = videoRef.value;
  if (!video) return;
  state.progressMap[activeChannel.value] = video.currentTime || 0;
  persistState();
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
  state.progressMap[activeChannel.value] = 0;
  persistState();
}

function resetProgress(channelId) {
  state.progressMap[channelId] = 0;
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
  { deep: true },
);

watch(currentUrl, async () => {
  await nextTick();
  videoDuration.value = 0;
  restoreProgressForCurrentChannel();
});

watch(
  () => state.playback,
  () => {
    persistState();
    applyVolume(state.playback.volume);
  },
  { deep: true },
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
</script>

<template>
  <div class="page">
    <div class="console-layout">
      <div ref="screenFrameRef" class="screen-frame">
        <template v-if="currentUrl">
          <video
            ref="videoRef"
            class="player"
            :autoplay="isPowerOn"
            :src="currentUrl"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @ended="onVideoEnded"
          />
          <div v-if="isPowerOn" class="screen-overlay-controls">
            <span class="time-chip">
              {{ formatTime(state.progressMap[activeChannel] || 0) }}/{{ formatTime(videoDuration) }}
            </span>
            <button class="fullscreen-chip" type="button" @click="toggleFullscreen">
              {{ isFullscreen ? "退出全屏" : "全屏" }}
            </button>
          </div>
          <div v-if="!isPowerOn" class="off-screen">
            <div>电视已关闭</div>
            <div>打开电源后自动播放当前频道</div>
          </div>
        </template>
        <div v-else class="empty-screen">
          <div>当前频道还没有视频</div>
          <div>请进入家长模式添加链接</div>
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
          <button class="volume-btn" type="button" @click="decreaseVolume">-</button>
          <div class="volume-display">VOL {{ volumeLevel }}</div>
          <button class="volume-btn" type="button" @click="increaseVolume">+</button>
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
            <span class="progress-tag">{{ formatTime(state.progressMap[item.id] || 0) }}</span>
          </button>
        </div>
        <button class="parent-icon-btn" type="button" aria-label="家长设置" @click="openChallenge">
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
    width="620"
    :destroy-on-close="false"
  >
    <div class="setting-desc">
      每个频道填写一个可直接播放的视频链接（mp4、m3u8 或浏览器可播放格式）。
    </div>
    <div v-for="item in channelItems" :key="`setting-${item.id}`" class="setting-row">
      <div class="setting-label">{{ item.id }} 号台</div>
      <a-input
        v-model:value="state.channelUrls[item.id - 1]"
        :placeholder="`请输入 ${item.id} 号台视频链接`"
      />
      <a-button danger @click="resetProgress(item.id)">清空进度</a-button>
    </div>
  </a-drawer>
</template>
