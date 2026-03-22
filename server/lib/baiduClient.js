export const BAIDU_M3U8_UA = "xpanvideo;KidsTV;1.0.0;Web;1;ts";

export async function baiduJson(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "pan.baidu.com",
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    const err = new Error(
      data.error_description || data.error || "baidu_api_error",
    );
    err.statusCode = 502;
    err.data = data;
    throw err;
  }
  return data;
}

export function normalizeDlink(dlink) {
  if (!dlink) return "";
  // 百度接口偶尔会把 "&" 以 "\\u0026" 的形式返回
  return String(dlink).replace(/\\u0026/g, "&");
}

