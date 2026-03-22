import { baiduJson, normalizeDlink } from "./baiduClient.js";

// dlink 通常有有效期；这里做一个短 TTL 缓存，避免每次 Range 都去打 filemetas
const DLINK_CACHE_TTL_MS = 10 * 60 * 1000;
const dlinkCache = new Map(); // fsid -> { upstreamUrl, expiresAt }
const dlinkInflight = new Map(); // fsid -> Promise<{ upstreamUrl }>

function getCachedUpstreamUrl(fsid) {
  const hit = dlinkCache.get(fsid);
  if (!hit) return "";
  if (Date.now() > hit.expiresAt) {
    dlinkCache.delete(fsid);
    return "";
  }
  return hit.upstreamUrl || "";
}

export async function getUpstreamUrlForFsid({ fsid, accessToken }) {
  const cached = getCachedUpstreamUrl(fsid);
  if (cached) return cached;

  const existing = dlinkInflight.get(fsid);
  if (existing) return (await existing).upstreamUrl;

  const p = (async () => {
    const metaUrl = new URL("https://pan.baidu.com/rest/2.0/xpan/multimedia");
    metaUrl.searchParams.set("method", "filemetas");
    metaUrl.searchParams.set("access_token", accessToken);
    metaUrl.searchParams.set("fsids", `[${fsid}]`);
    metaUrl.searchParams.set("dlink", "1");
    metaUrl.searchParams.set("needmedia", "1");

    const meta = await baiduJson(metaUrl.toString());
    const info = Array.isArray(meta.list) ? meta.list[0] : null;
    const dlink = normalizeDlink(info?.dlink);
    if (!dlink) {
      const err = new Error("missing_dlink");
      err.statusCode = 502;
      throw err;
    }
    const upstreamUrl = `${dlink}${dlink.includes("?") ? "&" : "?"}access_token=${accessToken}`;
    dlinkCache.set(fsid, {
      upstreamUrl,
      expiresAt: Date.now() + DLINK_CACHE_TTL_MS,
    });
    return { upstreamUrl };
  })();

  dlinkInflight.set(fsid, p);
  try {
    return (await p).upstreamUrl;
  } finally {
    dlinkInflight.delete(fsid);
  }
}

