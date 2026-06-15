/**
 * Economic Calendar — ForexFactory public feed
 * Gratis, tidak perlu API key, update tiap minggu
 * Endpoint: https://nfs.faireconomy.media/ff_calendar_thisweek.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { logger } from "./logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EconomicEvent {
  title: string;
  country: string;
  date: string;       // ISO string (EST timezone from ForexFactory)
  impact: "High" | "Medium" | "Low" | "Holiday";
  forecast: string;
  previous: string;
  actual?: string;
}

export interface CalendarContext {
  fetchedAt: string;
  eventsToday: EconomicEvent[];
  eventsNext4h: EconomicEvent[];
  eventsPast4h: EconomicEvent[];
  highImpactToday: EconomicEvent[];
  usdEventsToday: EconomicEvent[];
  alertLevel: "CLEAR" | "CAUTION" | "HIGH_ALERT";
  alertReason: string;
  summary: string;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL = 4 * 60 * 60 * 1000;   // 4 jam (ForexFactory hanya update mingguan)
const BACKOFF_429 = 15 * 60 * 1000;      // 15 menit setelah kena rate-limit
const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const CACHE_FILE = join(DATA_DIR, "calendar-cache.json");

let memCache: { data: EconomicEvent[]; ts: number } | null = null;
let backoffUntil = 0;

function loadDiskCache(): { data: EconomicEvent[]; ts: number } | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as { data: EconomicEvent[]; ts: number };
    return raw;
  } catch {
    return null;
  }
}

function saveDiskCache(data: EconomicEvent[]): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ data, ts: Date.now() }), "utf-8");
  } catch { /* non-fatal */ }
}

async function fetchCalendar(): Promise<EconomicEvent[]> {
  // 1. In-memory cache hit
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return memCache.data;
  }

  // 2. Load from disk if mem cache is cold (e.g. fresh restart)
  if (!memCache) {
    const disk = loadDiskCache();
    if (disk && Date.now() - disk.ts < CACHE_TTL) {
      memCache = disk;
      logger.info({ count: disk.data.length }, "Economic calendar loaded from disk cache");
      return disk.data;
    }
  }

  // 3. Respect 429 backoff — don't hammer ForexFactory after rate-limit
  if (Date.now() < backoffUntil) {
    const waitSec = Math.round((backoffUntil - Date.now()) / 1000);
    logger.debug({ waitSec }, "Skipping ForexFactory fetch — 429 backoff active");
    return memCache?.data ?? loadDiskCache()?.data ?? [];
  }

  // 4. Fetch from ForexFactory
  try {
    const res = await fetch(FF_URL, {
      headers: { "User-Agent": "Mozilla/5.0 AtlasBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 429) {
      backoffUntil = Date.now() + BACKOFF_429;
      logger.warn({ backoffMin: 15 }, "ForexFactory rate-limited (429) — backoff 15 min");
      return memCache?.data ?? loadDiskCache()?.data ?? [];
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = (await res.json()) as EconomicEvent[];
    memCache = { data: raw, ts: Date.now() };
    saveDiskCache(raw);
    logger.info({ count: raw.length }, "Economic calendar fetched from ForexFactory");
    return raw;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch economic calendar — using cached data or empty");
    return memCache?.data ?? loadDiskCache()?.data ?? [];
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** ForexFactory dates are EST (UTC-5). Convert to UTC for comparison. */
function eventToUtc(event: EconomicEvent): Date {
  const dt = new Date(event.date);
  // FF sends ISO format that may not include timezone offset — treat as EST (UTC-5)
  // The JSON dates already include -0500 offset in practice
  return dt;
}

const HIGH_IMPACT_USD_EVENTS = [
  "Non-Farm", "NFP", "Federal Funds Rate", "FOMC", "CPI", "PPI",
  "GDP", "Unemployment", "ISM", "Retail Sales", "PCE", "Payroll",
  "Consumer Price", "Producer Price", "Initial Jobless",
];

function isGoldRelevant(event: EconomicEvent): boolean {
  if (event.impact !== "High") return false;
  // USD events directly affect gold
  if (event.country === "USD") return true;
  // These central bank decisions also impact gold via risk sentiment
  if (["EUR", "GBP", "JPY", "CHF"].includes(event.country) && event.impact === "High") return true;
  return false;
}

function isHighImpactUsd(event: EconomicEvent): boolean {
  return event.country === "USD" && event.impact === "High";
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export async function getCalendarContext(): Promise<CalendarContext> {
  const events = await fetchCalendar();
  const now = new Date();

  // Window boundaries (UTC)
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);
  const next4h = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const past4h = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const eventsToday = events.filter((e) => {
    const t = eventToUtc(e);
    return t >= todayStart && t <= todayEnd && isGoldRelevant(e);
  });

  const eventsNext4h = events.filter((e) => {
    const t = eventToUtc(e);
    return t >= now && t <= next4h && isGoldRelevant(e);
  });

  const eventsPast4h = events.filter((e) => {
    const t = eventToUtc(e);
    return t >= past4h && t < now && isGoldRelevant(e);
  });

  const highImpactToday = eventsToday.filter((e) => e.impact === "High");
  const usdEventsToday = eventsToday.filter(isHighImpactUsd);

  // ─── Alert Level ────────────────────────────────────────────────────────────

  let alertLevel: CalendarContext["alertLevel"] = "CLEAR";
  let alertReason = "Tidak ada event high-impact dalam 4 jam ke depan";

  const imminentHighImpact = eventsNext4h.filter((e) => e.impact === "High");
  const within1h = events.filter((e) => {
    const t = eventToUtc(e);
    return t >= now && t <= new Date(now.getTime() + 60 * 60 * 1000) && isGoldRelevant(e) && e.impact === "High";
  });

  if (within1h.length > 0) {
    alertLevel = "HIGH_ALERT";
    alertReason = `⚠️ HIGH-IMPACT EVENT DALAM <1 JAM: ${within1h.map((e) => `${e.title} (${e.country})`).join(", ")}`;
  } else if (imminentHighImpact.length > 0) {
    alertLevel = "CAUTION";
    alertReason = `⚡ Event high-impact dalam 4 jam: ${imminentHighImpact.map((e) => e.title).join(", ")}`;
  } else if (highImpactToday.length > 0) {
    alertLevel = "CAUTION";
    alertReason = `📅 Ada ${highImpactToday.length} event high-impact hari ini`;
  }

  // ─── Summary Text ─────────────────────────────────────────────────────────

  const formatEvent = (e: EconomicEvent): string => {
    const t = eventToUtc(e);
    const wib = t.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    });
    const hasActual = e.actual && e.actual.trim() !== "";
    const status = hasActual ? `✓ Aktual: ${e.actual}` : `Forecast: ${e.forecast || "?"}`;
    return `  • ${wib} WIB — ${e.country} ${e.title} [${e.impact}] ${status} | Prev: ${e.previous || "?"}`;
  };

  const lines: string[] = [];

  if (eventsNext4h.length > 0) {
    lines.push("🔴 DALAM 4 JAM KE DEPAN:");
    eventsNext4h.forEach((e) => lines.push(formatEvent(e)));
  }

  if (eventsPast4h.length > 0) {
    lines.push("🟡 4 JAM TERAKHIR (sudah rilis):");
    eventsPast4h.forEach((e) => lines.push(formatEvent(e)));
  }

  const laterToday = eventsToday.filter((e) => {
    const t = eventToUtc(e);
    return t > next4h;
  });
  if (laterToday.length > 0) {
    lines.push("📅 HARI INI LAINNYA:");
    laterToday.forEach((e) => lines.push(formatEvent(e)));
  }

  if (lines.length === 0) {
    lines.push("  Tidak ada event high-impact relevan hari ini.");
  }

  const summary = lines.join("\n");

  return {
    fetchedAt: now.toISOString(),
    eventsToday,
    eventsNext4h,
    eventsPast4h,
    highImpactToday,
    usdEventsToday,
    alertLevel,
    alertReason,
    summary,
  };
}

/**
 * Format teks singkat untuk diinjek ke AI prompt
 */
export function formatCalendarForAI(ctx: CalendarContext): string {
  const alertEmoji =
    ctx.alertLevel === "HIGH_ALERT" ? "🚨" :
    ctx.alertLevel === "CAUTION" ? "⚠️" : "✅";

  const lines: string[] = [
    `## ${alertEmoji} KALENDER EKONOMI — EVENT RELEVAN XAUUSD`,
    `Status: **${ctx.alertLevel}** — ${ctx.alertReason}`,
    "",
  ];

  lines.push(ctx.summary);

  if (ctx.alertLevel === "HIGH_ALERT") {
    lines.push("");
    lines.push("🚨 INSTRUKSI KHUSUS: Ada event HIGH-IMPACT dalam <1 jam.");
    lines.push("   → Volatilitas ekstrem sangat mungkin terjadi.");
    lines.push("   → SANGAT DISARANKAN untuk WAIT kecuali setup konfluensi 9-10/10.");
    lines.push("   → Jika memberi sinyal, gunakan SL lebih lebar (1.5–2x ATR normal) dan TP lebih konservatif.");
  } else if (ctx.alertLevel === "CAUTION") {
    lines.push("");
    lines.push("⚡ CATATAN: Ada event high-impact dalam waktu dekat.");
    lines.push("   → Hati-hati dengan sinyal yang berlawanan dengan ekspektasi pasar.");
    lines.push("   → Pertimbangkan menaikkan threshold confluence minimal 7/10 sebelum entry.");
  }

  return lines.join("\n");
}
