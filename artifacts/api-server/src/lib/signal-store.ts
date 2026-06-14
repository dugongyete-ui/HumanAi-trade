import { randomUUID } from "crypto";
import type { AISignal } from "./ai-agent.js";

export interface Signal extends AISignal {
  id: string;
  timestamp: string;
  current_price: number;
  status: "active" | "tp_hit" | "sl_hit" | "wait";
  exit_price?: number;
  exit_time?: string;
  result?: "WIN" | "LOSS";
}

const MAX_SIGNALS = 100;
const signals: Signal[] = [];

export function storeSignal(aiSignal: AISignal, currentPrice: number): Signal {
  const status: Signal["status"] =
    aiSignal.decision !== "WAIT" && aiSignal.confidence >= 0.6 ? "active" : "wait";

  const signal: Signal = {
    ...aiSignal,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    current_price: currentPrice,
    status,
  };
  signals.unshift(signal);
  if (signals.length > MAX_SIGNALS) signals.splice(MAX_SIGNALS);
  return signal;
}

export function updateSignalResult(
  id: string,
  result: "WIN" | "LOSS",
  exitPrice: number
): void {
  const signal = signals.find((s) => s.id === id);
  if (signal) {
    signal.status = result === "WIN" ? "tp_hit" : "sl_hit";
    signal.result = result;
    signal.exit_price = exitPrice;
    signal.exit_time = new Date().toISOString();
  }
}

export function getSignals(limit = 20): Signal[] {
  return signals.slice(0, limit);
}

export function getLastSignal(): Signal | null {
  return signals[0] ?? null;
}

export function getTotalCount(): number {
  return signals.length;
}

export function getWinRate(): { wins: number; losses: number; rate: number } {
  const closed = signals.filter((s) => s.result);
  const wins = closed.filter((s) => s.result === "WIN").length;
  const losses = closed.filter((s) => s.result === "LOSS").length;
  return {
    wins,
    losses,
    rate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
  };
}
