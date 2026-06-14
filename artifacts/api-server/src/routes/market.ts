import { Router } from "express";
import { fetchCurrentTick, fetchCandles, GRANULARITY } from "../lib/deriv-client.js";

const router = Router();

router.get("/market/current", async (_req, res) => {
  try {
    const [tick, candlesM15, candlesH1] = await Promise.all([
      fetchCurrentTick(),
      fetchCandles(GRANULARITY.M15, 20),
      fetchCandles(GRANULARITY.H1, 20),
    ]);

    res.json({
      symbol: "XAUUSD",
      current_price: tick.quote,
      bid: tick.bid,
      ask: tick.ask,
      timestamp: new Date(tick.epoch * 1000).toISOString(),
      candles_m15: candlesM15.slice(-10),
      candles_h1: candlesH1.slice(-10),
    });
  } catch (err) {
    res.status(503).json({ error: "Failed to fetch market data", detail: err instanceof Error ? err.message : "Unknown" });
  }
});

export default router;
