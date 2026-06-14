import { Router } from "express";
import { getSignals } from "../lib/signal-store.js";

const router = Router();

router.get("/signals", (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "20", 10);
  res.json(getSignals(Math.min(limit, 100)));
});

export default router;
