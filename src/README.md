# 前端结构说明

儿童电视播放器前端采用 **Vue 3 Composition API**，按「状态 / 逻辑 / 视图」拆分为 composables 与组件，便于维护与扩展。

## 目录结构

```
src/
├── App.vue                 # 根组件：布局 + 挂载/卸载时初始化与清理
├── main.js                 # 入口，挂载 Vue 并注册 Ant Design Vue
├── constants.js            # 全局常量（频道数、存储键、扩展名、配色等）
├── composables/             # 可复用逻辑（状态与副作用）
│   ├── useKidsTvState.js   # 核心状态、持久化、当前频道/剧集/URL 等计算属性
│   ├── useParentGate.js    # 家长验证（数学题生成与校验）
│   ├── useSeriesBinding.js # 剧集绑定（本地文件夹、百度 m3u8）、进度与工具函数
│   ├── useBaiduBrowser.js  # 百度网盘目录浏览与绑定到频道
│   └── useVideoPlayback.js # 视频/HLS 播放、进度恢复、音量、全屏、换集
├── components/             # 页面级组件
│   ├── TvScreen.vue         # 电视屏幕：video、字幕、覆盖控制、关屏/空屏占位
│   ├── ControlPanel.vue    # 右侧面板：电源、音量、选台、家长设置入口
│   ├── ParentChallengeModal.vue  # 家长验证弹窗（数学题）
│   ├── ParentSettingsDrawer.vue  # 家长设置抽屉（链接、绑定、大童模式）
│   └── BaiduFolderModal.vue      # 百度网盘文件夹选择弹窗
├── data/
│   └── defaultChannels.js  # 默认频道链接（示例视频）
└── styles/
    └── main.css            # 全局样式（电视机布局、按钮、弹窗等）
```

## 数据流与职责

- **useKidsTvState**：唯一持久化状态源（`state`、`runtimeSeriesMap`、`activeChannel`、`isPowerOn` 等），负责 `loadState` / `persistState` 与 `seriesMeta` 归一化。
- **useVideoPlayback**：依赖当前 URL 与已保存进度，负责 `<video>` 与 HLS 的切换、进度恢复与保存、音量/全屏/换集；内部通过 `watch(currentUrl)` 响应换台/换集。
- **useSeriesBinding**：绑定本地文件夹或（配合 useBaiduBrowser）百度网盘后，写入 `runtimeSeriesMap` 与 `state.seriesMetaMap`，并释放 Blob URL。
- **useBaiduBrowser**：维护百度网盘弹窗状态，调用后端列目录与 listall，绑定文件夹时写入剧集列表（m3u8 URL）。
- **useParentGate**：数学题验证通过后打开家长设置抽屉（`settingsVisible`）。

组件仅负责展示与用户操作，通过直接导入上述 composables 使用同一份响应式状态，无需 props/emit 传递核心数据。
