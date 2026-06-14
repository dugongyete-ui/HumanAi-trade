import { Router } from "express";
import { startBot, stopBot, pauseBot, resumeBot, runAnalysis, getBotStatus } from "../lib/scheduler.js";

const router = Router();

router.get("/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

router.post("/bot/start", (_req, res) => {
  startBot();
  res.json(getBotStatus());
});

router.post("/bot/stop", (_req, res) => {
  stopBot();
  res.json(getBotStatus());
});

router.post("/bot/analyze", async (_req, res) => {
  const signal = await runAnalysis();
  if (!signal) {
    res.status(500).json({ error: "Analysis failed" });
    return;
  }
  res.json(signal);
});

export default router;
