<!--
  电视屏幕区域：展示当前频道的视频或占位内容。

  - 有 currentUrl 时：渲染 <video>，可选字幕 <track>；开机且非大童模式时显示右下角覆盖控制（集数、时间、全屏）
  - 关机时：显示「电视已关闭」遮罩
  - 无 currentUrl：显示「当前频道暂无可播放内容」占位

  依赖：useKidsTvState（currentUrl, state, currentEpisodeLabel, currentSubtitleUrl）、useVideoPlayback（videoRef, screenFrameRef, videoDuration, currentPlaybackTime, isFullscreen, useBaiduM3u8, formatTime, toggleFullscreen, onTimeUpdate, onLoadedMetadata, onVideoEnded）、useKidsTvState（isPowerOn）
-->
<script setup>
import { isPowerOn, state } from "../composables/useKidsTvState";
import {
  currentEpisodeLabel,
  currentPlaybackTime,
  currentSubtitleUrl,
  currentUrl,
  formatTime,
  isVideoLoading,
  onLoadedMetadata,
  onTimeUpdate,
  onVideoEnded,
  screenFrameRef,
  useBaiduM3u8,
  videoDuration,
  videoRef,
  isFullscreen,
  toggleFullscreen,
} from "../composables/useVideoPlayback";
</script>

<template>
  <div ref="screenFrameRef" class="screen-frame">
    <!-- 有可播放地址时显示播放器 -->
    <template v-if="currentUrl">
      <video
        ref="videoRef"
        class="player"
        :controls="state.playback.bigKidMode"
        :autoplay="isPowerOn"
        :src="useBaiduM3u8 ? undefined : currentUrl"
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
      <!-- 有地址但视频未就绪时显示加载中（百度 m3u8 需等待接口 ltime 秒） -->
      <div v-if="isVideoLoading && isPowerOn" class="screen-loading">
        加载中…
      </div>
      <!-- 开机且非大童模式：右下角显示集数、时间、全屏按钮 -->
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
      <!-- 关机时遮罩 -->
      <div v-if="!isPowerOn" class="off-screen">
        <div>电视已关闭</div>
        <div>打开电源后自动播放当前频道</div>
      </div>
    </template>
    <!-- 当前频道无链接且未绑定剧集时的占位 -->
    <div v-else class="empty-screen">
      <div>当前频道暂无可播放内容</div>
      <div>请在家长设置中填写链接或绑定本地文件夹</div>
    </div>
  </div>
</template>
