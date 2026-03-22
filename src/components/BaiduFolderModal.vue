<!--
  百度网盘文件夹选择弹窗：浏览目录，选择当前目录后绑定到目标频道。

  - 工具栏：返回、当前路径、绑定此文件夹到 N 号台
  - 错误提示（如未授权）
  - 当前目录下的文件/文件夹列表，点击文件夹进入子目录

  依赖：useBaiduBrowser（baiduBrowser, baiduEnterFolder, baiduGoBack, bindBaiduFolderToChannel）
-->
<script setup>
import {
  baiduBrowser,
  baiduEnterFolder,
  baiduGoBack,
  bindBaiduFolderToChannel,
} from "../composables/useBaiduBrowser";
</script>

<template>
  <a-modal
    v-model:open="baiduBrowser.open"
    title="选择百度网盘文件夹"
    :footer="null"
    width="720"
  >
    <div class="baidu-toolbar">
      <a-button
        :disabled="baiduBrowser.loading || baiduBrowser.stack.length === 0"
        @click="baiduGoBack"
      >
        返回
      </a-button>
      <div class="baidu-path">当前目录：{{ baiduBrowser.path }}</div>
      <a-button
        type="primary"
        :loading="baiduBrowser.loading"
        :disabled="!baiduBrowser.targetChannelId"
        @click="
          bindBaiduFolderToChannel(
            baiduBrowser.targetChannelId,
            baiduBrowser.path
          )
        "
      >
        绑定此文件夹到 {{ baiduBrowser.targetChannelId }} 号台
      </a-button>
    </div>
    <div v-if="baiduBrowser.error" class="baidu-error">
      {{ baiduBrowser.error }}（如未授权，请先打开
      `http://localhost:3001/api/auth/baidu/start`）
    </div>
    <div class="baidu-list">
      <div
        v-for="entry in baiduBrowser.entries"
        :key="entry.path"
        class="baidu-item"
        @click="baiduEnterFolder(entry)"
      >
        <div class="baidu-item-left">
          <span class="baidu-icon">{{ entry.isdir ? "📁" : "🎬" }}</span>
          <span class="baidu-name">{{ entry.server_filename }}</span>
        </div>
        <div class="baidu-item-right">{{ entry.isdir ? "文件夹" : "" }}</div>
      </div>
      <div
        v-if="!baiduBrowser.entries.length && !baiduBrowser.loading"
        class="baidu-empty"
      >
        空目录
      </div>
    </div>
  </a-modal>
</template>
