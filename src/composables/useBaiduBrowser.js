/**
 * 儿童电视播放器 - 百度网盘文件夹浏览与绑定
 *
 * 职责：
 * - 维护「选择百度网盘文件夹」弹窗的状态：当前路径、目录栈、条目列表、加载/错误
 * - 调用后端 /api/baidu/status、/api/baidu/files、/api/baidu/listall 完成目录浏览
 * - 将选中文件夹下的视频按 path 生成 m3u8 URL，写入 runtime 与 seriesMeta，并持久化
 *
 * 依赖：useKidsTvState, useSeriesBinding（releaseSeriesUrls, extractEpisodeNo, getBaiduM3u8Url, isLikelyVideoName, naturalNameCompare）
 */

import { nextTick, reactive } from "vue";
import { message } from "ant-design-vue";
import {
  activeChannel,
  persistState,
  runtimeSeriesMap,
  state,
} from "./useKidsTvState";
import {
  releaseSeriesUrls,
  extractEpisodeNo,
  getBaiduM3u8Url,
  isLikelyVideoName,
  naturalNameCompare,
} from "./useSeriesBinding";

/** 请求后端 JSON 接口，非 ok 时抛错 */
async function fetchJson(url) {
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) {
    const error = data?.error || "request_failed";
    throw new Error(error);
  }
  return data;
}

/**
 * 百度网盘浏览器弹窗的 UI 与数据状态。
 * - open: 弹窗是否显示
 * - loading: 是否正在加载目录
 * - error: 错误提示（如未授权）
 * - path: 当前展示的目录路径
 * - stack: 进入子目录前的路径栈，用于「返回」
 * - entries: 当前目录下的文件/文件夹列表
 * - targetChannelId: 本次要绑定到的频道号
 */
export const baiduBrowser = reactive({
  open: false,
  loading: false,
  error: "",
  path: "/",
  stack: [],
  entries: [],
  targetChannelId: null,
});

/** 为指定频道打开百度网盘选择弹窗，并加载根目录 */
export async function openBaiduBrowserForChannel(channelId) {
  baiduBrowser.targetChannelId = channelId;
  baiduBrowser.open = true;
  baiduBrowser.stack = [];
  await loadBaiduDir("/");
}

/** 加载指定目录下的文件与文件夹列表，写入 baiduBrowser.entries */
export async function loadBaiduDir(dir) {
  baiduBrowser.loading = true;
  baiduBrowser.error = "";
  try {
    const status = await fetchJson("/api/baidu/status");
    if (!status.connected) {
      baiduBrowser.error = "百度网盘未绑定，请先在后端完成授权。";
      baiduBrowser.entries = [];
      baiduBrowser.path = dir;
      return;
    }
    const data = await fetchJson(
      `/api/baidu/files?dir=${encodeURIComponent(dir)}`,
    );
    const list = Array.isArray(data.list) ? data.list : [];
    baiduBrowser.entries = list
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        isdir: Boolean(item.isdir),
        path: String(item.path || ""),
        server_filename: String(item.server_filename || ""),
        fs_id: item.fs_id,
      }))
      .sort((a, b) => {
        if (a.isdir !== b.isdir) return a.isdir ? -1 : 1;
        return naturalNameCompare(a.server_filename, b.server_filename);
      });
    baiduBrowser.path = dir;
  } catch (e) {
    baiduBrowser.error = `加载失败：${String(e?.message || e)}`;
  } finally {
    baiduBrowser.loading = false;
  }
}

/** 点击目录项进入子目录：将当前 path 入栈后加载 entry.path */
export function baiduEnterFolder(entry) {
  if (!entry?.isdir) return;
  baiduBrowser.stack.push(baiduBrowser.path);
  loadBaiduDir(entry.path);
}

/** 返回上一级：从 stack 弹出路径并加载 */
export function baiduGoBack() {
  const prev = baiduBrowser.stack.pop();
  if (prev == null) return;
  loadBaiduDir(prev);
}

/**
 * 将当前弹窗所在路径（文件夹）下的所有视频递归拉取，按集数/文件名排序后绑定到指定频道。
 * 使用 listall 分页拉取，生成 m3u8 URL（path 参数），写入 runtime 与 seriesMeta。
 */
export async function bindBaiduFolderToChannel(channelId, folderPath) {
  try {
    baiduBrowser.loading = true;
    baiduBrowser.error = "";

    const all = [];
    let start = 0;
    const limit = 1000;

    while (true) {
      const data = await fetchJson(
        `/api/baidu/listall?path=${encodeURIComponent(folderPath)}&recursion=1&start=${start}&limit=${limit}&order=name&desc=0`,
      );
      const list = Array.isArray(data.list) ? data.list : [];
      all.push(...list);
      const hasMore = Boolean(data.has_more);
      if (!hasMore) break;
      start += limit;
      if (start > 5000) break;
      await new Promise((r) => setTimeout(r, 120));
    }

    const videos = all
      .filter((item) => item && typeof item === "object" && !item.isdir)
      .map((item) => {
        const path = String(item.path || "").trim();
        return {
          name: String(item.server_filename || ""),
          episodeNo: extractEpisodeNo(String(item.server_filename || "")),
          url: path ? getBaiduM3u8Url(path) : "",
          path,
        };
      })
      .filter((it) => isLikelyVideoName(it.name) && it.url);
    if (!videos.length) {
      message.warning("该网盘文件夹下没有可识别的视频文件。");
      return;
    }
    debugger;
    videos.sort((a, b) => {
      const aHasNo = Number.isFinite(a.episodeNo);
      const bHasNo = Number.isFinite(b.episodeNo);
      if (aHasNo && bHasNo) return a.episodeNo - b.episodeNo;
      if (aHasNo) return -1;
      if (bHasNo) return 1;
      return naturalNameCompare(a.name, b.name);
    });

    releaseSeriesUrls(channelId);
    runtimeSeriesMap[channelId] = { episodes: videos };

    const folderName =
      folderPath.split("/").filter(Boolean).slice(-1)[0] || "百度网盘";
    const episodeNames = videos.map((v) => v.name);
    const episodePaths = videos.map((v) => v.path);
    const previousMeta = state.seriesMetaMap[channelId];
    const sameSeries =
      previousMeta?.source?.type === "baidu" &&
      previousMeta?.source?.path === folderPath;

    state.seriesMetaMap[channelId] = {
      seriesName: `百度：${folderName}`,
      episodeNames,
      episodePaths,
      currentEpisodeIndex: sameSeries
        ? Math.min(
            Math.max(Number(previousMeta?.currentEpisodeIndex || 0), 0),
            episodeNames.length - 1,
          )
        : 0,
      currentEpisodeTime: sameSeries
        ? Math.max(Number(previousMeta?.currentEpisodeTime || 0), 0)
        : 0,
      source: { type: "baidu", path: folderPath },
    };
    persistState();
    message.success(
      `${channelId} 号台已绑定百度网盘文件夹：${folderName}（${videos.length} 集）`,
    );

    baiduBrowser.open = false;
    if (channelId === activeChannel.value) {
      await nextTick();
      // 由播放层 watch currentUrl 触发恢复进度等
    }
  } catch (e) {
    message.error(`绑定失败：${String(e?.message || e)}`);
  } finally {
    baiduBrowser.loading = false;
  }
}
