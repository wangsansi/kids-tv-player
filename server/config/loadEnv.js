import fsSync from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { serverDir } from "../lib/runtimePaths.js";

// 优先加载 server/env.local，其次加载 server/.env（都不应提交到仓库）
export function loadEnv() {
  const envLocalPath = path.join(serverDir, "env.local");
  const envDotPath = path.join(serverDir, ".env");
  if (fsSync.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
    return;
  }
  if (fsSync.existsSync(envDotPath)) {
    dotenv.config({ path: envDotPath });
    return;
  }
  dotenv.config();
}
