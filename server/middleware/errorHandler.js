export function errorHandler(err, _req, res, _next) {
  if (res.headersSent) {
    // 流式响应已经开始，不能再写 JSON
    return;
  }
  const statusCode = Number(err?.statusCode || 500);
  res
    .status(statusCode)
    .json({ ok: false, error: String(err?.message || err), data: err?.data });
}

