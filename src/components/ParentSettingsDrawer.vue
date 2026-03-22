<!--
  家长设置抽屉：验证通过后打开，用于配置各频道与播放选项。

  - 顶部说明 + 大童模式开关（是否显示原生 video controls）
  - 每个频道一块：链接输入框、清空进度、绑定本地文件夹、绑定百度网盘、剧集信息展示、清空剧集

  依赖：useKidsTvState（channelItems, state, settingsVisible）、useSeriesBinding（bindSeriesFolder, clearSeries, resetProgress）、useBaiduBrowser（openBaiduBrowserForChannel）、useVideoPlayback（resetProgress）
-->
<script setup>
import {
  channelItems,
  state,
  settingsVisible,
} from "../composables/useKidsTvState";
import {
  bindSeriesFolder,
  clearSeries,
} from "../composables/useSeriesBinding";
import { openBaiduBrowserForChannel } from "../composables/useBaiduBrowser";
import { resetProgress } from "../composables/useVideoPlayback";
</script>

<template>
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
        <a-button @click="openBaiduBrowserForChannel(item.id)"
          >绑定百度网盘文件夹</a-button
        >
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
