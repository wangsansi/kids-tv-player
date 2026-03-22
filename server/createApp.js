import cors from "cors";
import express from "express";
import { createHealthRouter } from "./routes/health.js";
import { createBaiduAuthRouter } from "./routes/baiduAuth.js";
import { createBaiduRouter } from "./routes/baidu.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  const oauthStateSet = new Set();

  app.use("/api", createHealthRouter());
  app.use("/api", createBaiduAuthRouter({ oauthStateSet }));
  app.use("/api", createBaiduRouter());

  app.use(errorHandler);

  return app;
}

