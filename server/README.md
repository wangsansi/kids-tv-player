# kids-tv-player server

Express 后端，提供百度网盘 OAuth、目录浏览、m3u8 获取与分片代理等接口，供前端播放器使用。

## 本地启动

在项目根目录：

```bash
cd server
npm install
npm run dev
```

健康检查：

- `GET http://localhost:3001/api/health`

## 环境变量

复制 `server/env.example` 为你自己的环境文件（推荐 `server/env.local` 或 `server/.env`），并按需填写。

## 百度网盘 OAuth

1. 在百度网盘开放平台创建应用，拿到 `API Key / Secret Key`
2. 配置回调地址为：
   - `http://localhost:3001/api/auth/baidu/callback`
3. 在 `server/.env` 中填写：
   - `BAIDU_CLIENT_ID`
   - `BAIDU_CLIENT_SECRET`
   - `BAIDU_REDIRECT_URI`（默认已是上面的 callback）

授权入口：

- 打开 `http://localhost:3001/api/auth/baidu/start` 完成绑定

查看绑定状态：

- `GET http://localhost:3001/api/baidu/status`

## 目录结构

- `index.js`: 入口（加载 env + 启动）
- `createApp.js`: 组装 Express app、挂载路由与错误处理中间件
- `routes/`: API 路由（百度 OAuth/网盘相关、health）
- `lib/`: 百度相关的 token 存储、API 请求封装、dlink 缓存等
- `middleware/`: 通用中间件（错误处理）

