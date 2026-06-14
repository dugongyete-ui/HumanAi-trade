import cron from "node-cron";
import { fetchCandles, fetchCurrentTick, checkMarketOpen, GRANULARITY } from "./deriv-client.js";
import { buildTimeframeData } from "./indicators.js";
import { analyzeMarket, recordSignalResult as recordMemoryResult } from "./ai-agent.js";
import { storeSignal, updateSignalResult, getSignals, getLastSignal, getTotalCount, getWinRate, type Signal } from "./signal-store.js";
import { sendMessage, formatSignal, formatResult } from "./telegram.js";
import { logger } from "./logger.js";

const CONFIDENCE_THRESHOLD = 0.60;
const CRON_SCHEDULE = "*/1 * * * *";       // Analisis setiap 1 menit
const MONITOR_INTERVAL_MS = 10_000;        // Cek harga sinyal aktif setiap 10 detik
const MARKET_CACHE_TTL = 3 * 60 * 1000;   // Cache status pasar 3 menit

// ─── State ────────────────────────────────────────────────────────────────────

interface BotState {
  running: boolean;
  paused: boolean;
  mode: "ANALYZING" | "MONITORING";
  lastAnalysis: string | null;
  nextTick: Date | null;
  task: ReturnType<typeof cron.schedule> | null;
  monitorTimer: ReturnType<typeof setInterval> | null;
  activeSignal: Signal | null;
}

const state: BotState = {
  running: false,
  paused: false,
  mode: "ANALYZING",
  lastAnalysis: null,
  nextTick: null,
  task: null,
  monitorTimer: null,
  activeSignal: null,
};

// ─── Market Open Cache ─────────────────────────────────────────────────────────

let marketCache: { open: boolean; ts: number } | null = null;

async function cachedMarketOpen(): Promise<boolean> {
  if (marketCache && Date.now() - marketCache.ts < MARKET_CACHE_TTL) {
    return marketCache.open;
  }
  const open = await checkMarketOpen();
  marketCache = { open, ts: Date.now() };
  return open;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class MarketClosedError extends Error {
  constructor() {
    super("market_closed");
    this.name = "MarketClosedError";
  }
}

// ─── Price Monitor (MONITORING mode) ──────────────────────────────────────────

async function checkSignalOutcome(): Promise<void> {
  if (!state.activeSignal) return;
  const signal = state.activeSignal;

  try {
    const tick = await fetchCurrentTick();
    const price = tick.quote;
    let result: "WIN" | "LOSS" | null = null;

    if (signal.decision === "BUY") {
      if (signal.take_profit !== null && price >= signal.take_profit) result = "WIN";
      else if (signal.stop_loss !== null && price <= signal.stop_loss) result = "LOSS";
    } else if (signal.decision === "SELL") {
      if (signal.take_profit !== null && price <= signal.take_profit) result = "WIN";
      else if (signal.stop_loss !== null && price >= signal.stop_loss) result = "LOSS";
    }

    if (result) {
      updateSignalResult(signal.id, result, price);
      recordMemoryResult(result, price);
      await sendMessage(formatResult(signal, result, price));
      logger.info({ result, exitPrice: price, signalId: signal.id }, `Signal ${result}`);

      stopPriceMonitor();
      state.mode = "ANALYZING";
      state.activeSignal = null;
      logger.info("TP/SL triggered — switched back to ANALYZING mode");
    } else {
      logger.debug(
        { price: price.toFixed(2), tp: signal.take_profit?.toFixed(2), sl: signal.stop_loss?.toFixed(2) },
        "Monitoring: waiting for trigger"
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("closed")) {
      logger.warn("Market closed during monitoring — stopping monitor");
      marketCache = null;
      stopPriceMonitor();
      state.mode = "ANALYZING";
      state.activeSignal = null;
    } else {
      logger.error({ err }, "Error checking signal outcome");
    }
  }
}

function startPriceMonitor(): void {
  if (state.monitorTimer) return;
  state.monitorTimer = setInterval(() => {
    if (!state.paused) {
      checkSignalOutcome().catch((err) => logger.error({ err }, "Monitor tick error"));
    }
  }, MONITOR_INTERVAL_MS);
  logger.info({ intervalSec: MONITOR_INTERVAL_MS / 1000 }, "Price monitor started");
}

function stopPriceMonitor(): void {
  if (state.monitorTimer) {
    clearInterval(state.monitorTimer);
    state.monitorTimer = null;
    logger.info("Price monitor stopped");
  }
}

// ─── Full Analysis (ANALYZING mode) ───────────────────────────────────────────

export async function runAnalysis(): Promise<Signal | null> {
  logger.info("Starting XAUUSD market analysis");

  const isOpen = await cachedMarketOpen();
  if (!isOpen) {
    logger.warn("Pre-check: market is closed (exchange_is_open=0)");
    throw new MarketClosedError();
  }

  const [candlesM5, candlesM15, candlesH1, candlesH4, tick] = await Promise.all([
    fetchCandles(GRANULARITY.M5, 100),
    fetchCandles(GRANULARITY.M15, 100),
    fetchCandles(GRANULARITY.H1, 100),
    fetchCandles(GRANULARITY.H4, 100),
    fetchCurrentTick(),
  ]);

  const timeframes = [
    buildTimeframeData("M5", candlesM5),
    buildTimeframeData("M15", candlesM15),
    buildTimeframeData("H1", candlesH1),
    buildTimeframeData("H4", candlesH4),
  ];

  const currentPrice = tick.quote;
  logger.info({ price: currentPrice }, "Market data fetched");

  const aiSignal = await analyzeMarket(timeframes, currentPrice);
  logger.info({ decision: aiSignal.decision, confidence: aiSignal.confidence }, "AI analysis complete");

  const signal = storeSignal(aiSignal, currentPrice);
  state.lastAnalysis = new Date().toISOString();

  const isActionable =
    aiSignal.decision !== "WAIT" && aiSignal.confidence >= CONFIDENCE_THRESHOLD;

  if (isActionable) {
    await sendMessage(formatSignal(signal));
    logger.info({ decision: aiSignal.decision, id: signal.id }, "Signal sent to Telegram");

    // Switch to MONITORING mode
    state.mode = "MONITORING";
    state.activeSignal = signal;
    startPriceMonitor();
    logger.info(
      { tp: aiSignal.take_profit, sl: aiSignal.stop_loss },
      "Switched to MONITORING mode — waiting for TP/SL"
    );
  } else if (aiSignal.decision === "WAIT") {
    logger.info("AI decision: WAIT — continuing analysis next cycle");
  } else {
    logger.info({ confidence: aiSignal.confidence }, "Confidence below threshold — skipping");
  }

  return signal;
}

// ─── Bot Lifecycle ─────────────────────────────────────────────────────────────

export function startBot(): void {
  if (state.task) return;

  state.running = true;
  state.paused = false;
  state.mode = "ANALYZING";

  state.task = cron.schedule(CRON_SCHEDULE, async () => {
    if (state.paused) return;
    if (state.mode === "MONITORING") return; // price monitor handles this

    state.nextTick = null;
    try {
      await runAnalysis();
    } catch (err) {
      if (err instanceof MarketClosedError) {
        logger.warn("Scheduled analysis skipped — market closed");
        marketCache = null; // clear cache so next cycle re-checks
      } else {
        logger.error({ err }, "Scheduled analysis failed");
      }
    }
    state.nextTick = getNextRunTime();
  });

  state.nextTick = getNextRunTime();
  logger.info({ schedule: CRON_SCHEDULE }, "Bot scheduler started (1-minute cycle)");

  // Initial analysis attempt
  runAnalysis().catch((err) => {
    if (err instanceof MarketClosedError) {
      logger.warn("Initial analysis skipped — market is currently closed. Will retry on schedule.");
    } else {
      logger.error({ err }, "Initial analysis failed");
    }
  });
}

export function stopBot(): void {
  stopPriceMonitor();
  if (state.task) {
    state.task.stop();
    state.task = null;
  }
  state.running = false;
  state.paused = false;
  state.mode = "ANALYZING";
  state.activeSignal = null;
  state.nextTick = null;
  logger.info("Bot scheduler stopped");
}

export function pauseBot(): void {
  state.paused = true;
  logger.info("Bot paused");
}

export function resumeBot(): void {
  state.paused = false;
  logger.info("Bot resumed");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextRunTime(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(now.getMinutes() + 1);
  return next;
}

export function getBotStatus() {
  const { wins, losses, rate } = getWinRate();
  return {
    running: state.running && !state.paused,
    paused: state.paused,
    mode: state.mode,
    lastAnalysis: state.lastAnalysis,
    totalSignals: getTotalCount(),
    lastSignal: getLastSignal(),
    activeSignal: state.activeSignal,
    winRate: { wins, losses, rate },
    nextAnalysisIn:
      state.mode === "MONITORING"
        ? null
        : state.nextTick
          ? Math.max(0, Math.round((state.nextTick.getTime() - Date.now()) / 1000))
          : null,
  };
}

export { getSignals };
