import { Router } from "express";
import { getCalendarContext, type EconomicEvent } from "../lib/news-calendar.js";

const router = Router();

function normalize(events: EconomicEvent[]) {
  return events.map((e) => ({
    title: e.title,
    date: e.date,
    country: e.country,
    impact: e.impact,
    forecast: e.forecast || null,
    previous: e.previous || null,
    actual: e.actual ?? null,
  }));
}

router.get("/calendar", async (_req, res) => {
  try {
    const ctx = await getCalendarContext();
    res.json({
      alertLevel: ctx.alertLevel,
      alertMessage: ctx.alertReason,
      upcomingEvents: normalize(ctx.eventsNext4h ?? []),
      todayEvents: normalize(ctx.highImpactToday ?? []),
    });
  } catch (_err) {
    res.status(500).json({ error: "Calendar fetch failed" });
  }
});

export default router;
