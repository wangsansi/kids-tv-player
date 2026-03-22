# 记住进度 / 刷新后恢复 — 代码定位

百度网盘（剧集模式）的进度会写入 **seriesMeta.currentEpisodeTime** 和 **progressMap[channelId]**，并持久化到 localStorage。刷新后从 localStorage 读回，再在恢复时用 **getChannelSavedProgress** 取数并 seek。

---

## 一、写入进度（播放过程中）

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `useVideoPlayback.js` | `onTimeUpdate()`（约 277 行） | 视频 `timeupdate` 时调用 `saveCurrentProgress()` |
| 2 | `useVideoPlayback.js` | `saveCurrentProgress()`（约 106–122 行） | 用 `String(channelId)` 作 key，写 `seriesMeta.currentEpisodeTime` 和 `state.progressMap[key]`，再调 `persistState()` |

**检查点**：在这里打断点，看 `time` 是否有值、`seriesMeta` / `runtime` 是否存在、`persistState()` 是否被调用。

---

## 二、持久化到 localStorage

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `useKidsTvState.js` | `persistState()`（约 171–193 行） | 用 `toRaw` 处理 `seriesMetaMap` 后，和 `progressMap`、`activeChannel`、`isPowerOn` 等一起 `JSON.stringify` 并 `localStorage.setItem(STORAGE_KEY, ...)` |

**检查点**：在 `localStorage.setItem` 前打印 `payload.seriesMetaMap` 和 `payload.progressMap`，确认当前频道下有非 0 的 `currentEpisodeTime` / `progressMap` 值。  
**Key 名**：`STORAGE_KEY` 在 `constants.js` 里，当前为 `"kids-tv-player-state-v2"`。

---

## 三、页面卸载时再保存一次

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `App.vue` | `onPageHide()`（约 49–51 行） | `pagehide` 时调 `persistState()`，保证关页/刷新前再写一次 |

**检查点**：确认监听了 `pagehide`，且 `persistState` 来自 `useKidsTvState` 并确实执行。

---

## 四、刷新后从 localStorage 读回

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `App.vue` | `onMounted` 里先调 `loadState()`（约 34 行） | 触发加载 |
| 2 | `useKidsTvState.js` | `loadState()`（约 195–232 行） | `localStorage.getItem(STORAGE_KEY)` → `JSON.parse` → 写回 `state.progressMap`、`state.seriesMetaMap`（经 `normalizeSeriesMeta`）、`activeChannel`、`isPowerOn` |
| 3 | `useKidsTvState.js` | `normalizeSeriesMeta(meta)`（约 128–164 行） | 从解析出的 meta 里取 `currentEpisodeTime`（或兼容旧的 `episodeProgress`），保证最终 meta 里有 `currentEpisodeTime` |

**检查点**：在 `loadState()` 里、写回 `state.seriesMetaMap` 和 `state.progressMap` 之后，打印当前频道的 meta 和 progressMap 对应 key，确认有非 0 的进度。  
**注意**：`seriesMetaMap` 的 key 来自 `Object.entries(parsed.seriesMetaMap)`，是字符串（如 `"1"`），后面读取时也用 `String(channelId)` 保持一致。

---

## 五、恢复播放列表（百度网盘）

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `App.vue` | `onMounted` 里 `restoreBaiduRuntimeFromMeta()`（约 35 行） | 在 `loadState()` 之后调用 |
| 2 | `useSeriesBinding.js` | `restoreBaiduRuntimeFromMeta()`（约 133–147 行） | 遍历 `state.seriesMetaMap`，对 `source.type === "baidu"` 且存在 `episodePaths` 的频道，用 `episodeNames` + `episodePaths` 拼出 `episodes`，写入 `runtimeSeriesMap[channelId]` |

**检查点**：确认当前百度网盘频道在 `seriesMetaMap` 里有 `episodePaths` 和 `episodeNames`，且 `runtimeSeriesMap` 被正确写入，否则 `currentUrl` 和后续「读进度」会走错或拿不到剧集。

---

## 六、读取“已保存进度”用于恢复

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `useSeriesBinding.js` | `getChannelSavedProgress(channelId)`（约 154–165 行） | 用 `String(channelId)` 取 `state.seriesMetaMap[key]` 和 `runtimeSeriesMap[key]`；剧集模式优先用 `seriesMeta.currentEpisodeTime`，为 0 时用 `state.progressMap[key]` 兜底 |

**检查点**：在 `restoreProgressForCurrentChannel()` 里调用 `getChannelSavedProgress(activeChannel.value)` 后打印返回值，确认刷新后这里拿到的是非 0（你期望的秒数）。

---

## 七、把进度应用到视频（seek）

| 步骤 | 文件 | 位置 | 说明 |
|------|------|------|------|
| 1 | `useVideoPlayback.js` | `restoreProgressForCurrentChannel()`（约 198–268 行） | 用 `getChannelSavedProgress(activeChannel.value)` 得到 `saved`；若 `saved > 0`，在 `video.readyState >= 1` 时直接 `video.currentTime = ...`，否则给 `video` 绑一次 `loadedmetadata` 再 seek；并设 1.8s 的 fallback 再次 seek |
| 2 | 调用时机 | `useVideoPlayback.js` 里 `watch(currentUrl, ...)`（约 378–404 行） | URL 变化时在 watch 里调 `restoreProgressForCurrentChannel()` |
| 3 | 调用时机 | `App.vue` 的 `onMounted`（约 39–45 行） | `nextTick` 里调一次，`setTimeout(..., 400)` 再调一次 |

**检查点**：在 `restoreProgressForCurrentChannel()` 里打印 `saved` 和 `video.readyState`；若 `saved` 刷新后为 0，问题在「四」或「六」；若 `saved` 有值但画面没跳，问题在 seek 时机或 HLS。

---

## 建议的自查顺序

1. **先确认“写”是否生效**  
   在 `saveCurrentProgress()` 和 `persistState()` 里确认：剧集模式下 `seriesMeta.currentEpisodeTime` 和 `state.progressMap[key]` 被赋值，且 `persistState()` 被调用。

2. **再确认 localStorage 里是否有数**  
   在 `persistState()` 的 `localStorage.setItem` 前打印 `payload`，或在控制台看 `localStorage.getItem('kids-tv-player-state-v2')`，看 `seriesMetaMap[当前频道]` 和 `progressMap` 是否有非 0 进度。

3. **确认“读”是否一致**  
   在 `loadState()` 写回 `state` 后，打印当前频道的 `state.seriesMetaMap` / `state.progressMap`；在 `getChannelSavedProgress(activeChannel.value)` 里打印入参和返回值，确认 key 用 `String(channelId)` 与存储一致。

4. **确认恢复时是否真的 seek**  
   在 `restoreProgressForCurrentChannel()` 里看到 `saved > 0` 时，确认走到了 `applyRestore()` 或 fallback，并且 `video.currentTime` 被设置。

按上述位置和检查点逐段看，就能定位是「没写入」「没持久化」「没读回」还是「没 seek」。
