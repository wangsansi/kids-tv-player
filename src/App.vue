<!--
  儿童电视播放器 - 根组件

  布局：整页为「电视机」：左侧为屏幕（TvScreen），右侧为控制面板（ControlPanel）。
  全局弹窗：家长验证（ParentChallengeModal）、家长设置抽屉（ParentSettingsDrawer）、百度网盘文件夹选择（BaiduFolderModal）。

  初始化与清理：
  - onMounted：从 localStorage 恢复状态、同步音量显示、注册全屏变化监听、恢复当前频道进度并尝试自动播放
  - onUnmounted：移除全屏监听、销毁 HLS、移除单次元数据监听、释放各频道剧集 Blob URL
-->
<script setup>
import { nextTick, onMounted, onUnmounted } from "vue";
import TvScreen from "./components/TvScreen.vue";
import ControlPanel from "./components/ControlPanel.vue";
import ParentChallengeModal from "./components/ParentChallengeModal.vue";
import ParentSettingsDrawer from "./components/ParentSettingsDrawer.vue";
import BaiduFolderModal from "./components/BaiduFolderModal.vue";
import { loadState, persistState, runtimeSeriesMap, state } from "./composables/useKidsTvState";
import { releaseSeriesUrls, restoreBaiduRuntimeFromMeta } from "./composables/useSeriesBinding";
import {
  applyVolume,
  clearPendingLoadedDataListener,
  clearPendingMetadataListener,
  destroyHls,
  onFullscreenChange,
  restoreProgressForCurrentChannel,
  tryAutoplayCurrent,
  videoRef,
  volumeLevel,
} from "./composables/useVideoPlayback";

onMounted(() => {
  loadState();
  restoreBaiduRuntimeFromMeta();
  volumeLevel.value = Math.round(state.playback.volume * 100);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  window.addEventListener("pagehide", onPageHide);
  nextTick(() => {
    applyVolume(state.playback.volume);
    restoreProgressForCurrentChannel();
    tryAutoplayCurrent();
  });
});

function onPageHide() {
  persistState();
}

onUnmounted(() => {
  window.removeEventListener("pagehide", onPageHide);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  destroyHls();
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
      <TvScreen />
      <ControlPanel />
    </div>
    <ParentChallengeModal />
    <ParentSettingsDrawer />
    <BaiduFolderModal />
  </div>
</template>
