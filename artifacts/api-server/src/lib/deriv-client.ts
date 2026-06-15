import WebSocket from "ws";
import { logger } from "./logger.js";

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1";
const SYMBOL = "frxXAUUSD";
const REQUEST_TIMEOUT_MS = 15_000;
const RECONNECT_DELAY_MS = 2_000;

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

export interface Tick {
  bid: number;
  ask: number;
  quote: number;
  epoch: number;
}

// ─── Persistent Multiplexed WebSocket Connection ───────────────────────────────

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  msgType: string;
}

class DerivConnection {
  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private pending = new Map<number, PendingRequest>();
  private reqCounter = 1;

  private async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(DERIV_WS_URL);

      const connectTimeout = setTimeout(() => {
        ws.terminate();
        this.connecting = null;
        reject(new Error("Deriv WebSocket connection timeout"));
      }, REQUEST_TIMEOUT_MS);

      ws.on("open", () => {
        clearTimeout(connectTimeout);
        this.ws = ws;
        this.connecting = null;
        logger.debug("Deriv WebSocket connected");
        resolve();
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        this.connecting = null;
        reject(err);
      });

      ws.on("message", (raw) => {
        try {
          const data = JSON.parse(raw.toString()) as {
            msg_type?: string;
            req_id?: number;
            error?: { message: string };
            [key: string]: unknown;
          };

          const reqId = data.req_id;
          if (reqId === undefined) return;

          const pending = this.pending.get(reqId);
          if (!pending) return;

          clearTimeout(pending.timeout);
          this.pending.delete(reqId);

          if (data.error) {
            pending.reject(new Error(`Deriv API error: ${data.error.message}`));
          } else if (data.msg_type === pending.msgType) {
            pending.resolve(data);
          } else {
            pending.reject(new Error(`Unexpected msg_type: ${data.msg_type}`));
          }
        } catch {
          // ignore unparseable messages
        }
      });

      ws.on("close", () => {
        this.ws = null;
        logger.debug("Deriv WebSocket closed");
        // Reject all pending requests waiting on this connection
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Deriv WebSocket closed unexpectedly"));
          this.pending.delete(id);
        }
      });
    });

    return this.connecting;
  }

  async request<T>(payload: Record<string, unknown>, msgType: string): Promise<T> {
    // Reconnect if needed with a short delay to avoid tight loops
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await new Promise((r) => setTimeout(r, this.ws ? RECONNECT_DELAY_MS : 0));
      await this.connect();
    }

    const reqId = this.reqCounter++;
    const fullPayload = { ...payload, req_id: reqId };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`Deriv API timeout for ${msgType} (req_id=${reqId})`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(reqId, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout,
        msgType,
      });

      this.ws!.send(JSON.stringify(fullPayload));
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

const connection = new DerivConnection();

// ─── Public API ────────────────────────────────────────────────────────────────

export async function fetchCandles(granularity: number, count = 100): Promise<Candle[]> {
  const response = await connection.request<{
    candles: Array<{ open: string; high: string; low: string; close: string; epoch: number }>;
  }>(
    {
      ticks_history: SYMBOL,
      adjust_start_time: 1,
      count,
      end: "latest",
      granularity,
      style: "candles",
    },
    "candles"
  );

  return response.candles.map((c) => ({
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    epoch: c.epoch,
  }));
}

export async function fetchCurrentTick(): Promise<Tick> {
  const response = await connection.request<{
    tick: { bid: number; ask: number; quote: number; epoch: number };
  }>({ ticks: SYMBOL }, "tick");

  const t = response.tick;
  return {
    bid: t.bid,
    ask: t.ask,
    quote: t.quote,
    epoch: t.epoch,
  };
}

export async function checkMarketOpen(): Promise<boolean> {
  try {
    const response = await connection.request<{
      active_symbols: Array<{ symbol: string; exchange_is_open: number }>;
    }>({ active_symbols: "brief", product_type: "basic" }, "active_symbols");

    const gold = response.active_symbols.find((s) => s.symbol === SYMBOL);
    return gold?.exchange_is_open === 1;
  } catch {
    return false;
  }
}

export const GRANULARITY = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};
