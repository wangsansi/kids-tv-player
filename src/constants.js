/**
 * 儿童电视播放器 - 全局常量
 * 集中管理频道数量、存储键、文件类型、UI 配色等，便于维护与修改。
 */

/** localStorage 持久化数据的键名（版本变更时需同步更新以做数据迁移） */
export const STORAGE_KEY = "kids-tv-player-state-v2";

/** 频道总数（1～10 号台） */
export const CHANNEL_COUNT = 10;

/** 支持的视频文件扩展名，用于本地文件夹绑定时的文件筛选 */
export const VIDEO_EXTENSIONS = [".mp4", ".m4v", ".webm", ".mov", ".mkv"];

/** 支持的字幕文件扩展名，当前仅 SRT，会转换为 VTT 供 <track> 使用 */
export const SUBTITLE_EXTENSIONS = [".srt"];

/** 频道按钮的乐高风格配色（高饱和、活泼，面向低龄儿童） */
export const LEGO_COLORS = [
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
