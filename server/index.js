import { loadEnv } from "./config/loadEnv.js";
import { createApp } from "./createApp.js";

loadEnv();

const app = createApp();

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

// 兜底：避免 undici 的边界错误导致开发服务崩溃
process.on("unhandledRejection", (reason) => {
  if (
    reason &&
    typeof reason === "object" &&
    reason.code === "ERR_INVALID_STATE"
  ) {
    return;
  }
  console.error("UnhandledRejection:", reason);
});
