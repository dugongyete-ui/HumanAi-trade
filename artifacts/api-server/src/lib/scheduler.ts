import cron from "node-cron";
import { fetchCandles, fetchCurrentTick, GRANULARITY } from "./deriv-client.js";
import { buildTimeframeData } from "./indicators.js";
import { analyzeMarket } from "./ai-agent.js";
import { storeSignal, getSignals, getLastSignal, getTotalCount, type Signal } from "./signal-store.js";
import { sendMessage, formatSignal } from "./telegram.js";
import { logger } from "./logger.js";

const CONFIDENCE_THRESHOLD = 0.60;
const CRON_SCHEDULE = "*/15 * * * *";

interface BotState {
  running: boolean;
  paused: boolean;
  lastAnalysis: string | null;
  nextTick: Date | null;
  task: ReturnType<typeof cron.schedule> | null;
}

const state: BotState = {
  running: false,
  paused: false,
  lastAnalysis: null,
  nextTick: null,
  task: null,
};

export async function runAnalysis(): Promise<Signal | null> {
  logger.info("Starting XAUUSD market analysis");
  try {
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

    if (aiSignal.decision !== "WAIT" && aiSignal.confidence >= CONFIDENCE_THRESHOLD) {
      await sendMessage(formatSignal(signal));
      logger.info({ decision: aiSignal.decision, id: signal.id }, "Signal sent to Telegram");
    } else if (aiSignal.decision === "WAIT") {
      logger.info("AI decision: WAIT — no signal sent");
    } else {
      logger.info({ confidence: aiSignal.confidence }, "Signal confidence below threshold — not sent");
    }

    return signal;
  } catch (err) {
    logger.error({ err }, "Analysis failed");
    return null;
  }
}

export function startBot(): void {
  if (state.task) return;

  state.running = true;
  state.paused = false;

  state.task = cron.schedule(CRON_SCHEDULE, async () => {
    if (state.paused) return;
    state.nextTick = null;
    await runAnalysis();
    const next = getNextRunTime();
    state.nextTick = next;
  });

  state.nextTick = getNextRunTime();
  logger.info({ schedule: CRON_SCHEDULE }, "Bot scheduler started");

  runAnalysis().catch((err) => logger.error({ err }, "Initial analysis failed"));
}

export function stopBot(): void {
  if (state.task) {
    state.task.stop();
    state.task = null;
  }
  state.running = false;
  state.paused = false;
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

function getNextRunTime(): Date {
  const now = new Date();
  const next = new Date(now);
  const currentMinute = now.getMinutes();
  const minutesToNext = 15 - (currentMinute % 15);
  next.setMinutes(currentMinute + minutesToNext, 0, 0);
  return next;
}

export function getBotStatus() {
  return {
    running: state.running && !state.paused,
    paused: state.paused,
    lastAnalysis: state.lastAnalysis,
    totalSignals: getTotalCount(),
    lastSignal: getLastSignal(),
    nextAnalysisIn: state.nextTick ? Math.max(0, Math.round((state.nextTick.getTime() - Date.now()) / 1000)) : null,
  };
}

export { getSignals };
