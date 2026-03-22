import express from "express";

export function createHealthRouter() {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "kids-tv-player-server" });
  });
  return router;
}

