import fs from "node:fs/promises";
import path from "node:path";
import { serverDir } from "./runtimePaths.js";

const DATA_DIR = path.join(serverDir, "data");
const TOKEN_PATH = path.join(DATA_DIR, "baidu_token.json");

export function getBaiduEnv() {
  const BAIDU_CLIENT_ID = process.env.BAIDU_CLIENT_ID || "";
  const BAIDU_CLIENT_SECRET = process.env.BAIDU_CLIENT_SECRET || "";
  const BAIDU_REDIRECT_URI =
    process.env.BAIDU_REDIRECT_URI ||
    "http://localhost:3001/api/auth/baidu/callback";
  const BAIDU_SCOPE = process.env.BAIDU_SCOPE || "basic netdisk";
  return {
    BAIDU_CLIENT_ID,
    BAIDU_CLIENT_SECRET,
    BAIDU_REDIRECT_URI,
    BAIDU_SCOPE,
  };
}

export function requireBaiduEnv() {
  const { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } = getBaiduEnv();
  if (!BAIDU_CLIENT_ID || !BAIDU_CLIENT_SECRET) {
    const err = new Error("缺少 BAIDU_CLIENT_ID / BAIDU_CLIENT_SECRET");
    err.statusCode = 500;
    throw err;
  }
}

async function readTokenFile() {
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf-8");
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? json : null;
  } catch (_e) {
    return null;
  }
}

export async function writeTokenFile(token) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), "utf-8");
}

export async function deleteTokenFile() {
  try {
    await fs.unlink(TOKEN_PATH);
  } catch (_e) {
    // ignore
  }
}

export async function refreshAccessTokenIfNeeded() {
  const token = await readTokenFile();

  if (!token?.refresh_token) return token;

  const now = Date.now();
  const expiresAt = Number(token.expires_at || 0);
  const shouldRefresh = !expiresAt || expiresAt - now < 60_000;
  if (!shouldRefresh) return token;

  requireBaiduEnv();
  const { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } = getBaiduEnv();
  const url = new URL("https://openapi.baidu.com/oauth/2.0/token");
  url.searchParams.set("grant_type", "refresh_token");
  url.searchParams.set("refresh_token", token.refresh_token);
  url.searchParams.set("client_id", BAIDU_CLIENT_ID);
  url.searchParams.set("client_secret", BAIDU_CLIENT_SECRET);

  const resp = await fetch(url.toString());
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    return token;
  }
  const updated = {
    ...token,
    ...data,
    expires_at: Date.now() + Number(data.expires_in || 0) * 1000,
    updated_at: new Date().toISOString(),
  };
  await writeTokenFile(updated);
  return updated;
}

export async function getAccessTokenOrThrow() {
  const token = await refreshAccessTokenIfNeeded();
  if (!token?.access_token) {
    const err = new Error("百度网盘未绑定，请先完成授权");
    err.statusCode = 401;
    throw err;
  }
  return token.access_token;
}
