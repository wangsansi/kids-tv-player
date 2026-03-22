import express from "express";
import {
  getBaiduEnv,
  requireBaiduEnv,
  writeTokenFile,
} from "../lib/baiduTokenStore.js";

function randomState() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createBaiduAuthRouter({ oauthStateSet }) {
  const router = express.Router();

  // 1) 开始授权：跳转百度授权页
  router.get("/auth/baidu/start", async (_req, res, next) => {
    try {
      requireBaiduEnv();
      const { BAIDU_CLIENT_ID, BAIDU_REDIRECT_URI, BAIDU_SCOPE } = getBaiduEnv();

      const state = randomState();
      oauthStateSet.add(state);
      setTimeout(() => oauthStateSet.delete(state), 10 * 60 * 1000);

      const url = new URL("https://openapi.baidu.com/oauth/2.0/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", BAIDU_CLIENT_ID);
      url.searchParams.set("redirect_uri", BAIDU_REDIRECT_URI);
      url.searchParams.set("scope", BAIDU_SCOPE);
      url.searchParams.set("state", state);

      res.redirect(url.toString());
    } catch (e) {
      next(e);
    }
  });

  // 2) 回调：用 code 换 token 并保存
  router.get("/auth/baidu/callback", async (req, res, next) => {
    try {
      requireBaiduEnv();
      const { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET, BAIDU_REDIRECT_URI } =
        getBaiduEnv();

      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const error = String(req.query.error || "");
      if (error) {
        res.status(400).send(`Baidu auth error: ${error}`);
        return;
      }
      if (!code) {
        res.status(400).send("Missing code");
        return;
      }
      if (!oauthStateSet.has(state)) {
        res.status(400).send("Invalid state");
        return;
      }
      oauthStateSet.delete(state);

      const url = new URL("https://openapi.baidu.com/oauth/2.0/token");
      url.searchParams.set("grant_type", "authorization_code");
      url.searchParams.set("code", code);
      url.searchParams.set("client_id", BAIDU_CLIENT_ID);
      url.searchParams.set("client_secret", BAIDU_CLIENT_SECRET);
      url.searchParams.set("redirect_uri", BAIDU_REDIRECT_URI);

      const resp = await fetch(url.toString());
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error) {
        res.status(500).json({
          ok: false,
          error: data.error || "token_exchange_failed",
          data,
        });
        return;
      }

      const token = {
        ...data,
        expires_at: Date.now() + Number(data.expires_in || 0) * 1000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await writeTokenFile(token);

      res.send("百度网盘绑定成功，可以回到播放器继续设置。");
    } catch (e) {
      next(e);
    }
  });

  return router;
}

