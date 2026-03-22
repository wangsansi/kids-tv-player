import express from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BAIDU_M3U8_UA, baiduJson } from "../lib/baiduClient.js";
import {
  deleteTokenFile,
  getAccessTokenOrThrow,
  refreshAccessTokenIfNeeded,
} from "../lib/baiduTokenStore.js";
import { getUpstreamUrlForFsid } from "../lib/baiduDlinkCache.js";

export function createBaiduRouter() {
  const router = express.Router();

  // 3) 状态：前端用来判断是否已绑定
  router.get("/baidu/status", async (_req, res) => {
    const token = await refreshAccessTokenIfNeeded();
    res.json({
      ok: true,
      connected: Boolean(token?.access_token),
      expires_at: token?.expires_at || null,
      scope: token?.scope || null,
    });
  });

  // 4) 解绑：删除 token
  router.post("/baidu/logout", async (_req, res) => {
    await deleteTokenFile();
    res.json({ ok: true });
  });

  // 5) 列目录
  router.get("/baidu/files", async (req, res, next) => {
    try {
      const accessToken = await getAccessTokenOrThrow();
      const dir = String(req.query.dir || req.query.path || "/");
      const start = String(req.query.start || "0");
      const limit = String(req.query.limit || "200");
      const order = String(req.query.order || "name");
      const desc = String(req.query.desc || "0");
      const web = String(req.query.web || "1");
      const folder = String(req.query.folder || "0");

      const url = new URL("https://pan.baidu.com/rest/2.0/xpan/file");
      url.searchParams.set("method", "list");
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("dir", dir);
      url.searchParams.set("start", start);
      url.searchParams.set("limit", limit);
      url.searchParams.set("order", order);
      url.searchParams.set("desc", desc);
      url.searchParams.set("web", web);
      url.searchParams.set("folder", folder);

      const data = await baiduJson(url.toString());
      res.json({ ok: true, dir, ...data });
    } catch (e) {
      next(e);
    }
  });

  // 6.5) 递归列出目录下的所有文件（listall）
  router.get("/baidu/listall", async (req, res, next) => {
    try {
      const accessToken = await getAccessTokenOrThrow();
      const pathParam = String(req.query.path || req.query.dir || "/");
      const recursion = String(req.query.recursion || "1");
      const start = String(req.query.start || "0");
      const limit = String(req.query.limit || "1000");
      const order = String(req.query.order || "name");
      const desc = String(req.query.desc || "0");
      const web = String(req.query.web || "0");

      const url = new URL("https://pan.baidu.com/rest/2.0/xpan/multimedia");
      url.searchParams.set("method", "listall");
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("path", pathParam);
      url.searchParams.set("recursion", recursion);
      url.searchParams.set("start", start);
      url.searchParams.set("limit", limit);
      url.searchParams.set("order", order);
      url.searchParams.set("desc", desc);
      url.searchParams.set("web", web);

      const data = await baiduJson(url.toString());
      res.json({ ok: true, path: pathParam, ...data });
    } catch (e) {
      next(e);
    }
  });

  // 6) 获取文件直链信息（调试/绑定）
  router.get("/baidu/filemetas", async (req, res, next) => {
    try {
      const accessToken = await getAccessTokenOrThrow();
      const fsid = String(req.query.fsid || "");
      if (!fsid) {
        res.status(400).json({ ok: false, error: "Missing fsid" });
        return;
      }

      const upstreamUrl = await getUpstreamUrlForFsid({ fsid, accessToken });
      // 这里返回的 playableUrl 是带 token 的直链（用于调试/排查）
      res.json({ ok: true, info: { fs_id: fsid, playableUrl: upstreamUrl } });
    } catch (e) {
      next(e);
    }
  });

  // 7) 流式代理（用于 video src），支持 Range
  router.get("/baidu/stream", async (req, res, next) => {
    try {
      const accessToken = await getAccessTokenOrThrow();
      const fsid = String(req.query.fsid || "");
      if (!fsid) {
        res.status(400).json({ ok: false, error: "Missing fsid" });
        return;
      }

      const upstreamUrl = await getUpstreamUrlForFsid({ fsid, accessToken });
      const headers = { "User-Agent": "pan.baidu.com" };
      const range = req.headers.range;
      if (range) headers.Range = range;

      const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers,
        redirect: "follow",
      });

      res.status(upstream.status);

      const passHeaders = [
        "content-type",
        "content-length",
        "accept-ranges",
        "content-range",
        "etag",
        "last-modified",
      ];
      passHeaders.forEach((h) => {
        const v = upstream.headers.get(h);
        if (v) res.setHeader(h, v);
      });
      res.setHeader("cache-control", "no-store");

      try {
        if (!upstream.body) {
          res.end();
          return;
        }
        const nodeReadable = Readable.fromWeb(upstream.body);
        // 不主动 abort 上游，避免触发 fetch/undici 的边界 ERR_INVALID_STATE；
        // 客户端关闭时让 pipeline 自然结束即可
        await pipeline(nodeReadable, res);
      } catch (e) {
        if (res.headersSent || res.writableEnded || res.destroyed) return;
        throw e;
      }
    } catch (e) {
      next(e);
    }
  });

  // 7.5) 获取 m3u8 播放列表（两步：先拿 adToken，再拿 m3u8，并重写分片地址走本机代理）
  router.get("/baidu/m3u8", async (req, res, next) => {
    try {
      const accessToken = await getAccessTokenOrThrow();
      const filePath = String(req.query.path || "").trim();
      const type = String(req.query.type || "M3U8_AUTO_720");
      if (!filePath) {
        res.status(400).json({ ok: false, error: "Missing path" });
        return;
      }

      const segmentProxyPrefix = "/api/baidu/m3u8/segment?url=";

      const streamUrl = new URL("https://pan.baidu.com/rest/2.0/xpan/file");
      streamUrl.searchParams.set("method", "streaming");
      streamUrl.searchParams.set("access_token", accessToken);
      streamUrl.searchParams.set("path", filePath);
      streamUrl.searchParams.set("type", type);
      streamUrl.searchParams.set("nom3u8", "1");

      const firstResp = await fetch(streamUrl.toString(), {
        headers: { "User-Agent": BAIDU_M3U8_UA },
        redirect: "follow",
      });
      const firstData = await firstResp.json().catch(() => ({}));
      console.log(firstData, "firstData");

      if (firstData.errno !== 0 && firstData.errno !== 133) {
        const err = new Error(firstData.show_msg || `errno ${firstData.errno}`);
        err.statusCode = firstData.errno === 31341 ? 503 : 502;
        err.data = firstData;
        throw err;
      }
      if (!firstData.adToken) {
        const err = new Error("missing adToken from streaming api");
        err.statusCode = 502;
        err.data = firstData;
        throw err;
      }

      // 百度要求：第二次请求须在第一次响应后等待 ltime 秒，否则拿不到 m3u8（通常 5～15 秒）
      const ltime = Math.min(Number(firstData.ltime) || 0, 30);
      if (ltime > 0) {
        await new Promise((r) => setTimeout(r, ltime * 1000));
      }

      streamUrl.searchParams.set("adToken", firstData.adToken);
      streamUrl.searchParams.set("nom3u8", "0");

      const secondResp = await fetch(streamUrl.toString(), {
        headers: { "User-Agent": BAIDU_M3U8_UA },
        redirect: "follow",
      });
      const contentType = secondResp.headers.get("content-type") || "";
      let m3u8Text = await secondResp.text();

      if (contentType.includes("application/json")) {
        const json = JSON.parse(m3u8Text || "{}");
        if (json.errno !== 0) {
          const err = new Error(json.show_msg || `errno ${json.errno}`);
          err.statusCode = json.errno === 31341 ? 503 : 502;
          err.data = json;
          throw err;
        }
        m3u8Text = json.content || json.m3u8 || m3u8Text;
      }

      const lines = m3u8Text.split(/\r?\n/);
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        if (/^https?:\/\//i.test(trimmed)) {
          return segmentProxyPrefix + encodeURIComponent(trimmed);
        }
        if (/^[^#\s]+\.(ts|m3u8)/i.test(trimmed)) {
          try {
            const resolved = new URL(trimmed, streamUrl.toString()).toString();
            return segmentProxyPrefix + encodeURIComponent(resolved);
          } catch (_e) {
            return line;
          }
        }
        return line;
      });

      res.setHeader("content-type", "application/vnd.apple.mpegurl");
      res.setHeader("cache-control", "no-store");
      res.send(rewritten.join("\n"));
    } catch (e) {
      next(e);
    }
  });

  // 7.6) 代理 m3u8 分片请求（ts），带合规 User-Agent。Express 已对 query 解码一次，若仍含 % 再解码一次避免拉进度时请求错误分片 URL 导致 400。
  router.get("/baidu/m3u8/segment", async (req, res, next) => {
    try {
      let segmentUrl = String(req.query.url || "").trim();
      if (!segmentUrl) {
        res.status(400).json({ ok: false, error: "Missing url" });
        return;
      }
      while (segmentUrl.includes("%") && !/^https?:\/\//i.test(segmentUrl)) {
        try {
          const decoded = decodeURIComponent(segmentUrl);
          if (decoded === segmentUrl) break;
          segmentUrl = decoded;
        } catch (_e) {
          break;
        }
      }
      if (!/^https?:\/\//i.test(segmentUrl)) {
        res.status(400).json({ ok: false, error: "Invalid url" });
        return;
      }

      const headers = {
        "User-Agent": BAIDU_M3U8_UA,
        Referer: "https://pan.baidu.com/",
      };
      const range = req.headers.range;
      if (range) headers.Range = range;

      const upstream = await fetch(segmentUrl, {
        method: "GET",
        headers,
        redirect: "follow",
      });

      res.status(upstream.status);
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("content-type", ct);
      res.setHeader("cache-control", "no-store");

      if (!upstream.body) {
        res.end();
        return;
      }
      const nodeReadable = Readable.fromWeb(upstream.body);
      await pipeline(nodeReadable, res);
    } catch (e) {
      if (res.headersSent) return;
      next(e);
    }
  });

  return router;
}
