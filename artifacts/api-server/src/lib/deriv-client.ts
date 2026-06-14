import WebSocket from "ws";

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1";
const SYMBOL = "frxXAUUSD";

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

function connectAndRequest<T>(payload: object, msgType: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Deriv API timeout for ${msgType}`));
    }, 15000);

    const ws = new WebSocket(DERIV_WS_URL);

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("open", () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Deriv API error: ${data.error.message}`));
          return;
        }
        if (data.msg_type === msgType) {
          clearTimeout(timeout);
          ws.close();
          resolve(data as T);
        }
      } catch {
        clearTimeout(timeout);
        ws.close();
        reject(new Error("Failed to parse Deriv API response"));
      }
    });
  });
}

export async function fetchCandles(granularity: number, count = 100): Promise<Candle[]> {
  const response = await connectAndRequest<{ candles: Array<{ open: string; high: string; low: string; close: string; epoch: number }> }>(
    {
      ticks_history: SYMBOL,
      adjust_start_time: 1,
      count,
      end: "latest",
      granularity,
      style: "candles",
      req_id: 1,
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
  const response = await connectAndRequest<{ tick: { bid: number; ask: number; quote: number; epoch: number } }>(
    { ticks: SYMBOL, req_id: 2 },
    "tick"
  );

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
    const response = await connectAndRequest<{
      active_symbols: Array<{ symbol: string; exchange_is_open: number }>;
    }>(
      { active_symbols: "brief", product_type: "basic" },
      "active_symbols"
    );
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
