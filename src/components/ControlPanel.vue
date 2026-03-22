<!--
  电视机右侧控制面板：电源、音量、选台、家长设置入口。

  - 电源：LED 指示灯 + 开关按钮，点击切换 isPowerOn 并触发 setPower
  - 音量：减/加按钮 + VOL 数值展示
  - 选台：1～10 号频道按钮，显示每台已保存进度；点击切换频道
  - 家长设置：齿轮按钮，点击打开数学验证（由 ParentChallengeModal 展示）

  依赖：useKidsTvState（channelItems, state）、useVideoPlayback（setPower, increaseVolume, decreaseVolume, volumeLevel, switchChannel, formatTime）、useSeriesBinding（getChannelProgressForDisplay）、useParentGate（openChallenge）
-->
<script setup>
import {
  activeChannel,
  channelItems,
  isPowerOn,
} from "../composables/useKidsTvState";
import { openChallenge } from "../composables/useParentGate";
import { getChannelProgressForDisplay } from "../composables/useSeriesBinding";
import {
  formatTime,
  decreaseVolume,
  increaseVolume,
  setPower,
  switchChannel,
  volumeLevel,
} from "../composables/useVideoPlayback";
</script>

<template>
  <aside class="control-panel">
    <!-- 电源：LED + 开关 -->
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
    <!-- 音量 -->
    <div class="volume-wrap">
      <button class="volume-btn" type="button" @click="decreaseVolume">-</button>
      <div class="volume-display">VOL {{ volumeLevel }}</div>
      <button class="volume-btn" type="button" @click="increaseVolume">+</button>
    </div>
    <!-- 选台 1～10 -->
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
    <!-- 家长设置入口 -->
    <button
      class="parent-icon-btn"
      type="button"
      aria-label="家长设置"
      @click="openChallenge"
    >
      ⚙
    </button>
  </aside>
</template>
