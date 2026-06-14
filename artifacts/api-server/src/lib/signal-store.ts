import { randomUUID } from "crypto";
import type { AISignal } from "./ai-agent.js";

export interface Signal extends AISignal {
  id: string;
  timestamp: string;
  current_price: number;
}

const MAX_SIGNALS = 100;
const signals: Signal[] = [];

export function storeSignal(aiSignal: AISignal, currentPrice: number): Signal {
  const signal: Signal = {
    ...aiSignal,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    current_price: currentPrice,
  };
  signals.unshift(signal);
  if (signals.length > MAX_SIGNALS) signals.splice(MAX_SIGNALS);
  return signal;
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
