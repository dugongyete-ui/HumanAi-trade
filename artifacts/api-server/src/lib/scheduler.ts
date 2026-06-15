import cron from "node-cron";
import { fetchCandles, fetchCurrentTick, checkMarketOpen, fetchUSDProxy, GRANULARITY, type USDProxy } from "./deriv-client.js";
import { buildTimeframeData } from "./indicators.js";
import { analyzeMarket, analyzeMarketOnDemand, recordSignalResult as recordMemoryResult, type OnDemandSignal } from "./ai-agent.js";
import {
  storeSignal, updateSignalResult, getSignals, getLastSignal,
  getTotalCount, getWinRate, type Signal,
} from "./signal-store.js";
import { sendMessage, formatSignal, formatWaitBrief, formatResult, formatPartialTP } from "./telegram.js";
import { logger } from "./logger.js";

const CRON_SCHEDULE = "*/5 * * * *";
const MONITOR_INTERVAL_MS = 10_000;
const MARKET_CACHE_TTL = 3 * 60 * 1000;

// ─── Session-aware Thresholds ─────────────────────────────────────────────────

interface SessionConfig {
  confidenceMin: number;
  confluenceMin: number;
  label: string;
}

function getSessionConfig(): SessionConfig {
  const h = new Date().getUTCHours();
  // Asia session 22:00–07:59 UTC (05:00–14:59 WIB) — lebih longgar dari sebelumnya
  if (h >= 22 || h < 8) return { confidenceMin: 0.58, confluenceMin: 4, label: "Asia" };
  // London+NY overlap 12:00–15:59 UTC — sesi paling aktif
  if (h >= 12 && h < 16) return { confidenceMin: 0.53, confluenceMin: 4, label: "London+NY Overlap (aktif)" };
  // London 08:00–11:59 UTC / NY 16:00–21:59 UTC
  return { confidenceMin: 0.55, confluenceMin: 4, label: "London/NY (standar)" };
}

// ─── Monitor State (TP1/TP2 + Trailing SL) ───────────────────────────────────

interface MonitorState {
  tp1: number;        // 50% milestone — SL moves to breakeven when hit
  tp2: number;        // original TP (final target)
  trailingSL: number; // active SL — starts at original, moves to breakeven on TP1 hit
  tp1Hit: boolean;    // whether TP1 milestone has been reached
}

function buildMonitorState(signal: Signal): MonitorState {
  const entry = signal.entry_price ?? signal.current_price;
  const tp2 = signal.take_profit ?? entry;
  const sl = signal.stop_loss ?? entry;
  // TP1 = 50% of the way from entry to final TP
  const tp1 =
    signal.decision === "BUY"
      ? entry + (tp2 - entry) * 0.5
      : entry - (entry - tp2) * 0.5;
  return { tp1, tp2, trailingSL: sl, tp1Hit: false };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface BotState {
  running: boolean;
  analysisInProgress: boolean;
  paused: boolean;
  mode: "ANALYZING" | "MONITORING";
  lastAnalysis: string | null;
  nextTick: Date | null;
  task: ReturnType<typeof cron.schedule> | null;
  monitorTimer: ReturnType<typeof setInterval> | null;
  activeSignal: Signal | null;
  monitorState: MonitorState | null;
  /** Timestamp (ms) of the most recent /chat analysis completion — used to suppress
   *  scheduled WAIT briefs that would overlap and confuse the user. */
  lastChatAnalysisAt: number | null;
}

const state: BotState = {
  running: false,
  analysisInProgress: false,
  paused: false,
  mode: "ANALYZING",
  lastAnalysis: null,
  nextTick: null,
  task: null,
  monitorTimer: null,
  activeSignal: null,
  monitorState: null,
  lastChatAnalysisAt: null,
};

// ─── Market Open Cache ────────────────────────────────────────────────────────

let marketCache: { open: boolean; ts: number } | null = null;

async function cachedMarketOpen(): Promise<boolean> {
  if (marketCache && Date.now() - marketCache.ts < MARKET_CACHE_TTL) return marketCache.open;
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

// ─── Signal Close Handler ─────────────────────────────────────────────────────

async function handleSignalClose(
  signal: Signal,
  exitPrice: number,
  result: "WIN" | "LOSS",
  closeType: "tp" | "tp2" | "sl" | "breakeven"
): Promise<void> {
  updateSignalResult(signal.id, result, exitPrice);
  recordMemoryResult(result, exitPrice);

  const isBreakeven = closeType === "breakeven";
  await sendMessage(formatResult(signal, result, exitPrice, isBreakeven));

  logger.info({ result, exitPrice, signalId: signal.id, closeType }, `Signal closed: ${result} (${closeType})`);

  stopPriceMonitor();
  state.mode = "ANALYZING";
  state.activeSignal = null;
  state.monitorState = null;
  logger.info("Switched back to ANALYZING mode");
}

// ─── Price Monitor (MONITORING mode) ─────────────────────────────────────────

async function checkSignalOutcome(): Promise<void> {
  if (!state.activeSignal || !state.monitorState) return;
  const signal = state.activeSignal;
  const ms = state.monitorState;

  try {
    const tick = await fetchCurrentTick();
    const price = tick.quote;

    if (signal.decision === "BUY") {
      // TP1 hit — move SL to breakeven, keep monitoring for TP2
      if (!ms.tp1Hit && price >= ms.tp1) {
        ms.tp1Hit = true;
        ms.trailingSL = signal.entry_price ?? signal.current_price;
        await sendMessage(formatPartialTP(signal, price, ms.tp1, ms.tp2));
        logger.info(
          { tp1: ms.tp1.toFixed(2), breakeven: ms.trailingSL.toFixed(2) },
          "TP1 hit — SL moved to breakeven, waiting for TP2"
        );
        return;
      }
      // TP2 — full WIN
      if (price >= ms.tp2) {
        await handleSignalClose(signal, price, "WIN", ms.tp1Hit ? "tp2" : "tp");
        return;
      }
      // Trailing SL hit
      if (price <= ms.trailingSL) {
        // If TP1 was already hit, capital is protected → count as breakeven WIN
        await handleSignalClose(signal, price, ms.tp1Hit ? "WIN" : "LOSS", ms.tp1Hit ? "breakeven" : "sl");
        return;
      }
    } else if (signal.decision === "SELL") {
      if (!ms.tp1Hit && price <= ms.tp1) {
        ms.tp1Hit = true;
        ms.trailingSL = signal.entry_price ?? signal.current_price;
        await sendMessage(formatPartialTP(signal, price, ms.tp1, ms.tp2));
        logger.info(
          { tp1: ms.tp1.toFixed(2), breakeven: ms.trailingSL.toFixed(2) },
          "TP1 hit — SL moved to breakeven, waiting for TP2"
        );
        return;
      }
      if (price <= ms.tp2) {
        await handleSignalClose(signal, price, "WIN", ms.tp1Hit ? "tp2" : "tp");
        return;
      }
      if (price >= ms.trailingSL) {
        await handleSignalClose(signal, price, ms.tp1Hit ? "WIN" : "LOSS", ms.tp1Hit ? "breakeven" : "sl");
        return;
      }
    }

    logger.debug(
      {
        price: price.toFixed(2),
        tp1: ms.tp1.toFixed(2),
        tp2: ms.tp2.toFixed(2),
        trailSL: ms.trailingSL.toFixed(2),
        tp1Hit: ms.tp1Hit,
      },
      "Monitoring: waiting for trigger"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("closed")) {
      logger.warn("Market closed during monitoring — stopping monitor");
      marketCache = null;
      stopPriceMonitor();
      state.mode = "ANALYZING";
      state.activeSignal = null;
      state.monitorState = null;
    } else {
      logger.error({ err }, "Error checking signal outcome");
    }
  }
}

function startPriceMonitor(signal: Signal): void {
  if (state.monitorTimer) return;
  state.monitorState = buildMonitorState(signal);
  state.monitorTimer = setInterval(() => {
    if (!state.paused) {
      checkSignalOutcome().catch((err) => logger.error({ err }, "Monitor tick error"));
    }
  }, MONITOR_INTERVAL_MS);
  logger.info(
    {
      intervalSec: MONITOR_INTERVAL_MS / 1000,
      tp1: state.monitorState.tp1.toFixed(2),
      tp2: state.monitorState.tp2.toFixed(2),
      trailSL: state.monitorState.trailingSL.toFixed(2),
    },
    "Price monitor started with TP1/TP2/TrailingSL"
  );
}

function stopPriceMonitor(): void {
  if (state.monitorTimer) {
    clearInterval(state.monitorTimer);
    state.monitorTimer = null;
    logger.info("Price monitor stopped");
  }
}

// ─── Full Analysis (ANALYZING mode) ──────────────────────────────────────────

export async function runAnalysis(): Promise<Signal | null> {
  if (state.analysisInProgress) {
    logger.warn("runAnalysis skipped — analysis already in progress");
    throw new Error("analysis_in_progress");
  }

  state.analysisInProgress = true;
  try {
    return await _runAnalysisInternal();
  } finally {
    state.analysisInProgress = false;
  }
}

async function _runAnalysisInternal(): Promise<Signal | null> {
  logger.info("Starting XAUUSD market analysis");

  const isOpen = await cachedMarketOpen();
  if (!isOpen) {
    logger.warn("Pre-check: market is closed (exchange_is_open=0)");
    throw new MarketClosedError();
  }

  const [candlesM5, candlesM15, candlesH1, candlesH4, candlesD1, tick, usdProxy] = await Promise.all([
    fetchCandles(GRANULARITY.M5, 100),
    fetchCandles(GRANULARITY.M15, 100),
    fetchCandles(GRANULARITY.H1, 100),
    fetchCandles(GRANULARITY.H4, 100),
    fetchCandles(GRANULARITY.D1, 50),
    fetchCurrentTick(),
    fetchUSDProxy().catch((err): USDProxy => {
      logger.warn({ err }, "USD proxy fetch failed — using neutral fallback");
      return {
        symbol: "USD (data tidak tersedia)",
        trend: "USD_NEUTRAL",
        interpretation: "Data USD tidak tersedia saat ini — abaikan faktor USD dalam analisis ini",
        last_close: 0,
        change_pct_10h: 0,
      };
    }),
  ]);

  const timeframes = [
    buildTimeframeData("M5", candlesM5),
    buildTimeframeData("M15", candlesM15),
    buildTimeframeData("H1", candlesH1),
    buildTimeframeData("H4", candlesH4),
    buildTimeframeData("D1", candlesD1),
  ];

  const currentPrice = tick.quote;
  logger.info({ price: currentPrice }, "Market data fetched");

  const aiSignal = await analyzeMarket(timeframes, currentPrice, tick, usdProxy);
  logger.info({ decision: aiSignal.decision, confidence: aiSignal.confidence }, "AI analysis complete");

  const signal = storeSignal(aiSignal, currentPrice);
  state.lastAnalysis = new Date().toISOString();

  // Apply session-aware thresholds
  const sessionConfig = getSessionConfig();
  const confluenceOk = (aiSignal.confluence_score ?? 0) >= sessionConfig.confluenceMin;
  const isActionable =
    aiSignal.decision !== "WAIT" &&
    aiSignal.confidence >= sessionConfig.confidenceMin &&
    confluenceOk;

  // Suppress scheduled WAIT brief if a /chat analysis was done recently (within 90s).
  // This prevents overlap confusion where the user sees the scheduled brief
  // right after sending /chat and mistakes it for the on-demand response.
  const CHAT_SUPPRESS_MS = 90_000;
  const chatRecentlyDone =
    state.lastChatAnalysisAt !== null &&
    Date.now() - state.lastChatAnalysisAt < CHAT_SUPPRESS_MS;

  if (isActionable) {
    await sendMessage(formatSignal(signal));
    logger.info(
      { decision: aiSignal.decision, id: signal.id, session: sessionConfig.label },
      "Signal sent to Telegram"
    );

    state.mode = "MONITORING";
    state.activeSignal = signal;
    startPriceMonitor(signal);
    logger.info(
      {
        tp1: state.monitorState?.tp1.toFixed(2),
        tp2: state.monitorState?.tp2.toFixed(2),
        trailSL: state.monitorState?.trailingSL.toFixed(2),
      },
      "Switched to MONITORING mode"
    );
  } else if (chatRecentlyDone) {
    // A /chat was done recently — skip the scheduled WAIT brief to avoid confusion.
    logger.info(
      { suppressedSince: state.lastChatAnalysisAt },
      "Scheduled WAIT brief suppressed — /chat analysis was done within 90s"
    );
  } else if (aiSignal.decision === "WAIT") {
    await sendMessage(formatWaitBrief(signal));
    logger.info(
      { confidence: aiSignal.confidence, confluence: aiSignal.confluence_score },
      "AI decision: WAIT — brief analysis sent to Telegram"
    );
  } else {
    await sendMessage(formatWaitBrief(signal));
    logger.info(
      {
        decision: aiSignal.decision,
        confidence: aiSignal.confidence,
        minRequired: sessionConfig.confidenceMin,
        confluenceOk,
        session: sessionConfig.label,
      },
      "Below session threshold — brief analysis sent to Telegram"
    );
  }

  return signal;
}

// ─── On-Demand Chat Analysis (/chat) ─────────────────────────────────────────

export interface ChatAnalysisResult {
  signal: OnDemandSignal;
  monitorStarted: boolean;
  conflictSignal: { decision: string; entry_price?: number | null; timestamp: string } | null;
}

export async function runChatAnalysis(userQuery: string): Promise<ChatAnalysisResult> {
  const isOpen = await cachedMarketOpen();
  if (!isOpen) throw new MarketClosedError();

  const [candlesM5, candlesM15, candlesH1, candlesH4, candlesD1, tick, usdProxy] = await Promise.all([
    fetchCandles(GRANULARITY.M5, 100),
    fetchCandles(GRANULARITY.M15, 100),
    fetchCandles(GRANULARITY.H1, 100),
    fetchCandles(GRANULARITY.H4, 100),
    fetchCandles(GRANULARITY.D1, 50),
    fetchCurrentTick(),
    fetchUSDProxy().catch((err): USDProxy => {
      logger.warn({ err }, "USD proxy fetch failed — using neutral fallback (chat)");
      return {
        symbol: "USD (data tidak tersedia)",
        trend: "USD_NEUTRAL",
        interpretation: "Data USD tidak tersedia saat ini — abaikan faktor USD dalam analisis ini",
        last_close: 0,
        change_pct_10h: 0,
      };
    }),
  ]);

  const timeframes = [
    buildTimeframeData("M5", candlesM5),
    buildTimeframeData("M15", candlesM15),
    buildTimeframeData("H1", candlesH1),
    buildTimeframeData("H4", candlesH4),
    buildTimeframeData("D1", candlesD1),
  ];

  const currentPrice = tick.quote;
  logger.info({ price: currentPrice, query: userQuery }, "Market data fetched for /chat");

  const signal = await analyzeMarketOnDemand(userQuery, timeframes, currentPrice, tick, usdProxy);

  // Record completion time so scheduled WAIT briefs are suppressed for 90s
  state.lastChatAnalysisAt = Date.now();

  // ── Integrate IMMEDIATE_ENTRY into monitoring state machine ──────────────
  let monitorStarted = false;
  let conflictSignal: ChatAnalysisResult["conflictSignal"] = null;

  if (signal.setup_type === "IMMEDIATE_ENTRY" && (signal.decision === "BUY" || signal.decision === "SELL")) {
    if (state.activeSignal && state.monitorTimer) {
      // Already monitoring another signal — report conflict, don't start new monitor
      conflictSignal = {
        decision: state.activeSignal.decision,
        entry_price: state.activeSignal.entry_price,
        timestamp: state.activeSignal.timestamp,
      };
      logger.warn(
        { existing: state.activeSignal.decision, chat: signal.decision },
        "/chat IMMEDIATE_ENTRY skipped — already monitoring a signal"
      );
    } else {
      // Check session thresholds (same gate as auto mode)
      const sessionConfig = getSessionConfig();
      const confluenceOk = (signal.confluence_score ?? 0) >= sessionConfig.confluenceMin;
      const passesThreshold = signal.confidence >= sessionConfig.confidenceMin && confluenceOk;

      if (passesThreshold) {
        const stored = storeSignal(signal, currentPrice);
        state.lastAnalysis = new Date().toISOString();
        state.mode = "MONITORING";
        state.activeSignal = stored;
        startPriceMonitor(stored);
        monitorStarted = true;
        logger.info(
          { decision: signal.decision, id: stored.id, tp: stored.take_profit, sl: stored.stop_loss },
          "/chat IMMEDIATE_ENTRY — monitoring started"
        );
      } else {
        logger.info(
          { confidence: signal.confidence, minRequired: sessionConfig.confidenceMin, confluenceOk },
          "/chat IMMEDIATE_ENTRY — below session threshold, monitoring not started"
        );
      }
    }
  }

  return { signal, monitorStarted, conflictSignal };
}

// ─── Bot Lifecycle ────────────────────────────────────────────────────────────

export function startBot(): void {
  if (state.task) return;

  state.running = true;
  state.paused = false;
  state.mode = "ANALYZING";

  state.task = cron.schedule(CRON_SCHEDULE, async () => {
    if (state.paused) return;
    if (state.mode === "MONITORING") return;

    state.nextTick = null;
    try {
      await runAnalysis();
    } catch (err) {
      if (err instanceof MarketClosedError) {
        logger.warn("Scheduled analysis skipped — market closed");
        marketCache = null;
      } else {
        logger.error({ err }, "Scheduled analysis failed");
      }
    }
    state.nextTick = getNextRunTime();
  });

  state.nextTick = getNextRunTime();
  logger.info({ schedule: CRON_SCHEDULE }, "Bot scheduler started (5-minute cycle)");

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
  state.monitorState = null;
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
  // Cron runs every 5 minutes on the 0/5/10/... boundary
  const currentMin = now.getMinutes();
  const nextMin = Math.ceil((currentMin + 1) / 5) * 5;
  next.setMinutes(nextMin);
  if (nextMin >= 60) {
    next.setMinutes(nextMin - 60);
    next.setHours(next.getHours() + 1);
  }
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
    monitorState: state.monitorState
      ? {
          tp1: state.monitorState.tp1,
          tp2: state.monitorState.tp2,
          trailingSL: state.monitorState.trailingSL,
          tp1Hit: state.monitorState.tp1Hit,
        }
      : null,
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
