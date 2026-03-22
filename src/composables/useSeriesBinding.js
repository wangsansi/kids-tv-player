/**
 * 儿童电视播放器 - 剧集绑定与文件工具
 *
 * 职责：
 * - 绑定本地文件夹：showDirectoryPicker 选目录，扫描视频/字幕，生成剧集列表并写入 runtime + seriesMeta
 * - 剧集相关工具：释放 Blob URL、解析集数、判断视频/字幕扩展名、SRT 转 VTT、自然排序
 * - 百度 m3u8 URL 生成与判断、清空剧集、获取频道已保存进度（供播放与 UI 展示）
 *
 * 依赖：useKidsTvState（state, runtimeSeriesMap, activeChannel, persistState）
 */

import { nextTick } from "vue";
import { message } from "ant-design-vue";
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS } from "../constants";
import {
  activeChannel,
  persistState,
  runtimeSeriesMap,
  state,
} from "./useKidsTvState";

// ---------------------------------------------------------------------------
// 剧集 URL 释放与清空
// ---------------------------------------------------------------------------

/**
 * 释放指定频道剧集的 Blob URL（本地文件、字幕），并删除该频道的 runtime。
 * 在重新绑定或清空剧集时调用，避免内存泄漏。
 */
export function releaseSeriesUrls(channelId) {
  const runtime = runtimeSeriesMap[channelId];
  if (!runtime?.episodes?.length) return;
  runtime.episodes.forEach((episode) => {
    if (episode.url && episode.url.startsWith("blob:")) {
      URL.revokeObjectURL(episode.url);
    }
    if (episode.subtitleUrl && episode.subtitleUrl.startsWith("blob:")) {
      URL.revokeObjectURL(episode.subtitleUrl);
    }
  });
  delete runtimeSeriesMap[channelId];
}

/** 清空指定频道的剧集绑定与进度，并持久化 */
export function clearSeries(channelId) {
  releaseSeriesUrls(channelId);
  delete state.seriesMetaMap[channelId];
  persistState();
  message.success(`已清空 ${channelId} 号台剧集绑定`);
}

// ---------------------------------------------------------------------------
// 文件名与集数解析
// ---------------------------------------------------------------------------

/**
 * 从文件名中解析集数，支持「第 N 集」「Ep N」「E01」「数字」等格式。
 * @returns {number | null} 解析到的集数，失败为 null
 */
export function extractEpisodeNo(fileName) {
  const rules = [/第\s*(\d+)\s*[集话]/i, /(?:ep|e)\s*0*(\d+)/i, /(\d{1,4})/i];
  for (const regex of rules) {
    const match = fileName.match(regex);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

export function isVideoFile(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isSubtitleFile(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getFileStem(fileName) {
  const idx = String(fileName || "").lastIndexOf(".");
  if (idx <= 0) return fileName;
  return fileName.slice(0, idx);
}

/** 用于匹配字幕与视频：小写、去扩展名、空白归一化 */
export function normalizeFileStem(fileName) {
  return getFileStem(fileName).toLowerCase().replace(/\s+/g, "");
}

/** 将 SRT 内容转为 WebVTT 供 <track> 使用（逗号改点、加 WEBVTT 头） */
export function srtToVtt(srtText) {
  const text = String(srtText || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${text}`;
}

/** 中文/数字自然排序，用于剧集列表排序 */
export function naturalNameCompare(a, b) {
  return String(a).localeCompare(String(b), "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

/** 判断是否为可能的视频文件名（扩展名在 VIDEO_EXTENSIONS 内） */
export function isLikelyVideoName(name) {
  const lower = String(name || "").toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ---------------------------------------------------------------------------
// 百度 m3u8
// ---------------------------------------------------------------------------

export function getBaiduM3u8Url(path) {
  return `/api/baidu/m3u8?path=${encodeURIComponent(String(path))}`;
}

export function isBaiduM3u8Url(url) {
  return url && String(url).includes("/api/baidu/m3u8");
}

// ---------------------------------------------------------------------------
// 刷新后恢复百度网盘播放列表
// ---------------------------------------------------------------------------

/**
 * 根据已持久化的 seriesMetaMap 中百度网盘源的 episodePaths，恢复 runtimeSeriesMap。
 * 在 loadState() 之后调用，这样刷新页面后无需重新选择文件夹即可继续播放。
 */
export function restoreBaiduRuntimeFromMeta() {
  Object.entries(state.seriesMetaMap || {}).forEach(([channelId, meta]) => {
    if (meta?.source?.type !== "baidu" || !Array.isArray(meta.episodePaths)) return;
    const paths = meta.episodePaths;
    const names = meta.episodeNames || [];
    if (paths.length === 0 || paths.length !== names.length) return;
    const episodes = names.map((name, i) => ({
      name,
      path: paths[i],
      url: getBaiduM3u8Url(paths[i]),
      episodeNo: extractEpisodeNo(name),
    }));
    runtimeSeriesMap[channelId] = { episodes };
  });
}

// ---------------------------------------------------------------------------
// 进度查询（供播放逻辑与 UI 展示）
// ---------------------------------------------------------------------------

/** 获取指定频道已保存的播放进度（秒）。剧集模式优先用 seriesMeta.currentEpisodeTime，为 0 时用 progressMap 兜底（刷新后恢复）。 */
export function getChannelSavedProgress(channelId) {
  const key = String(channelId);
  const seriesMeta = state.seriesMetaMap[key];
  const runtime = runtimeSeriesMap[key];
  const mapTime = Number(state.progressMap[key] ?? 0);
  if (seriesMeta && runtime?.episodes?.length) {
    const metaTime = Number(seriesMeta.currentEpisodeTime ?? 0);
    return metaTime > 0 ? metaTime : mapTime;
  }
  return mapTime;
}

/** 与 getChannelSavedProgress 一致，用于频道按钮上的进度标签展示 */
export function getChannelProgressForDisplay(channelId) {
  return getChannelSavedProgress(channelId);
}

// ---------------------------------------------------------------------------
// 绑定本地文件夹
// ---------------------------------------------------------------------------

/**
 * 使用 File System Access API 选择本地文件夹，扫描视频与 SRT 字幕，
 * 按集数/文件名排序后写入 runtimeSeriesMap 与 seriesMetaMap，并持久化。
 */
export async function bindSeriesFolder(channelId) {
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
      const subtitleFile = subtitleFileMap.get(
        normalizeFileStem(videoFile.name)
      );
      let subtitleUrl = "";
      if (subtitleFile) {
        const vttText = srtToVtt(await subtitleFile.text());
        subtitleUrl = URL.createObjectURL(
          new Blob([vttText], { type: "text/vtt" })
        );
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
      // 由调用方或 watch 负责 videoDuration、restoreProgress
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    message.error("绑定文件夹失败，请重试。");
  }
}
