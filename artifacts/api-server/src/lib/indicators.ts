import type { Candle } from "./deriv-client.js";

// ─── Core Calculations ────────────────────────────────────────────────────────

export function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function rsi(closes: number[], period = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  if (gains.length < period) return result;

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  return result;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MACDResult[] {
  if (closes.length < slow + signalPeriod) return [];
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const offset = slow - fast;
  const macdLine = slowEma.map((v, i) => fastEma[i + offset] - v);
  const signalLine = ema(macdLine, signalPeriod);
  const signalOffset = macdLine.length - signalLine.length;
  return signalLine.map((s, i) => ({
    macd: macdLine[i + signalOffset],
    signal: s,
    histogram: macdLine[i + signalOffset] - s,
  }));
}

export interface BollingerBand {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

export function bollingerBands(closes: number[], period = 20, multiplier = 2): BollingerBand[] {
  const result: BollingerBand[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    const upper = mean + multiplier * std;
    const lower = mean - multiplier * std;
    result.push({ upper, middle: mean, lower, bandwidth: (upper - lower) / mean });
  }
  return result;
}

export function atr(candles: Candle[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  const result: number[] = [];
  let avg = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(avg);
  for (let i = period; i < trs.length; i++) {
    avg = (avg * (period - 1) + trs[i]) / period;
    result.push(avg);
  }
  return result;
}

export interface StochasticResult {
  k: number;
  d: number;
}

export function stochastic(candles: Candle[], period = 14, smoothK = 3, smoothD = 3): StochasticResult[] {
  const rawK: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const lowest = Math.min(...slice.map((c) => c.low));
    const highest = Math.max(...slice.map((c) => c.high));
    const range = highest - lowest;
    rawK.push(range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100);
  }
  const smoothedK = sma(rawK, smoothK);
  const smoothedD = sma(smoothedK, smoothD);
  const offset = smoothedK.length - smoothedD.length;
  return smoothedD.map((d, i) => ({ k: smoothedK[i + offset], d }));
}

// ─── New Indicators ───────────────────────────────────────────────────────────

export interface IchimokuResult {
  tenkan: number | null;
  kijun: number | null;
  senkou_a: number | null;
  senkou_b: number | null;
  chikou: number | null;
  cloud_color: "bullish" | "bearish" | "neutral";
  price_vs_cloud: "above" | "below" | "inside";
  tenkan_kijun_cross: "bullish" | "bearish" | "neutral";
}

export function ichimoku(candles: Candle[]): IchimokuResult | null {
  if (candles.length < 52) return null;

  const donchianMid = (c: Candle[], from: number, len: number): number => {
    const slice = c.slice(from, from + len);
    return (Math.max(...slice.map((x) => x.high)) + Math.min(...slice.map((x) => x.low))) / 2;
  };

  const n = candles.length;
  const tenkan = donchianMid(candles, n - 9, 9);
  const kijun = donchianMid(candles, n - 26, 26);
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = donchianMid(candles, n - 52, 52);
  const chikou = candles[n - 1].close;
  const currentClose = candles[n - 1].close;

  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);

  const cloudColor: "bullish" | "bearish" | "neutral" =
    senkouA > senkouB ? "bullish" : senkouA < senkouB ? "bearish" : "neutral";

  const priceVsCloud: "above" | "below" | "inside" =
    currentClose > cloudTop ? "above" : currentClose < cloudBottom ? "below" : "inside";

  const tenkanKijunCross: "bullish" | "bearish" | "neutral" =
    tenkan > kijun ? "bullish" : tenkan < kijun ? "bearish" : "neutral";

  return {
    tenkan,
    kijun,
    senkou_a: senkouA,
    senkou_b: senkouB,
    chikou,
    cloud_color: cloudColor,
    price_vs_cloud: priceVsCloud,
    tenkan_kijun_cross: tenkanKijunCross,
  };
}

export interface FibonacciLevels {
  swing_high: number;
  swing_low: number;
  trend: "up" | "down";
  level_0: number;
  level_236: number;
  level_382: number;
  level_500: number;
  level_618: number;
  level_786: number;
  level_1000: number;
  nearest_level: string;
  price_zone: string;
}

export function fibonacciRetracement(candles: Candle[]): FibonacciLevels | null {
  if (candles.length < 20) return null;

  const recent = candles.slice(-50);
  const swingHigh = Math.max(...recent.map((c) => c.high));
  const swingLow = Math.min(...recent.map((c) => c.low));
  const range = swingHigh - swingLow;
  if (range === 0) return null;

  const currentClose = candles[candles.length - 1].close;
  const highIdx = recent.findIndex((c) => c.high === swingHigh);
  const lowIdx = recent.findIndex((c) => c.low === swingLow);
  const trend: "up" | "down" = highIdx > lowIdx ? "down" : "up";

  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const levels = ratios.map((r) =>
    trend === "up" ? swingHigh - r * range : swingLow + r * range
  );

  let nearestLabel = "0%";
  let minDist = Infinity;
  const labels = ["0%", "23.6%", "38.2%", "50%", "61.8%", "78.6%", "100%"];
  levels.forEach((lvl, i) => {
    const dist = Math.abs(currentClose - lvl);
    if (dist < minDist) { minDist = dist; nearestLabel = labels[i]; }
  });

  const pct = trend === "up"
    ? (swingHigh - currentClose) / range
    : (currentClose - swingLow) / range;

  let priceZone = "Extended";
  if (pct <= 0.236) priceZone = "Strong trend zone (0–23.6%)";
  else if (pct <= 0.382) priceZone = "Shallow retracement (23.6–38.2%)";
  else if (pct <= 0.5) priceZone = "Moderate retracement (38.2–50%)";
  else if (pct <= 0.618) priceZone = "Golden zone (50–61.8%)";
  else if (pct <= 0.786) priceZone = "Deep retracement (61.8–78.6%)";
  else priceZone = "Near full retracement (>78.6%)";

  return {
    swing_high: swingHigh,
    swing_low: swingLow,
    trend,
    level_0: levels[0],
    level_236: levels[1],
    level_382: levels[2],
    level_500: levels[3],
    level_618: levels[4],
    level_786: levels[5],
    level_1000: levels[6],
    nearest_level: nearestLabel,
    price_zone: priceZone,
  };
}

export function williamsR(candles: Candle[], period = 14): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map((c) => c.high));
    const lowest = Math.min(...slice.map((c) => c.low));
    const range = highest - lowest;
    result.push(range === 0 ? -50 : ((highest - candles[i].close) / range) * -100);
  }
  return result;
}

export function cci(candles: Candle[], period = 20): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const typicalPrices = slice.map((c) => (c.high + c.low + c.close) / 3);
    const meanTP = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const meanDev = typicalPrices.reduce((a, b) => a + Math.abs(b - meanTP), 0) / period;
    result.push(meanDev === 0 ? 0 : (typicalPrices[typicalPrices.length - 1] - meanTP) / (0.015 * meanDev));
  }
  return result;
}

// ─── Pattern Detection ────────────────────────────────────────────────────────

export interface CandlePattern {
  name: string;
  type: "bullish" | "bearish" | "neutral";
}

export function detectPatterns(candles: Candle[]): CandlePattern[] {
  if (candles.length < 3) return [];
  const patterns: CandlePattern[] = [];
  const c = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  if (range > 0) {
    if (body / range < 0.1) {
      patterns.push({ name: "Doji", type: "neutral" });
    }
    if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close > c.open) {
      patterns.push({ name: "Hammer", type: "bullish" });
    }
    if (upperWick > body * 2 && lowerWick < body * 0.5 && c.close < c.open) {
      patterns.push({ name: "Shooting Star", type: "bearish" });
    }
  }

  const prevBody = Math.abs(prev.close - prev.open);
  if (prevBody > 0) {
    if (prev.close < prev.open && c.close > c.open && c.open < prev.close && c.close > prev.open) {
      patterns.push({ name: "Bullish Engulfing", type: "bullish" });
    }
    if (prev.close > prev.open && c.close < c.open && c.open > prev.close && c.close < prev.open) {
      patterns.push({ name: "Bearish Engulfing", type: "bearish" });
    }
  }

  return patterns;
}

// ─── Market Structure ─────────────────────────────────────────────────────────

export interface MarketStructure {
  trend: "uptrend" | "downtrend" | "sideways";
  swingHighs: number[];
  swingLows: number[];
  supportLevels: number[];
  resistanceLevels: number[];
}

export function analyzeStructure(candles: Candle[]): MarketStructure {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i + 2].high
    ) {
      swingHighs.push(candles[i].high);
    }
    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i + 2].low
    ) {
      swingLows.push(candles[i].low);
    }
  }

  let trend: "uptrend" | "downtrend" | "sideways" = "sideways";
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastTwoHighs = swingHighs.slice(-2);
    const lastTwoLows = swingLows.slice(-2);
    if (lastTwoHighs[1] > lastTwoHighs[0] && lastTwoLows[1] > lastTwoLows[0]) {
      trend = "uptrend";
    } else if (lastTwoHighs[1] < lastTwoHighs[0] && lastTwoLows[1] < lastTwoLows[0]) {
      trend = "downtrend";
    }
  }

  const supportLevels = swingLows.slice(-3);
  const resistanceLevels = swingHighs.slice(-3);

  return { trend, swingHighs, swingLows, supportLevels, resistanceLevels };
}

// ─── Full Sensory Data Builder ────────────────────────────────────────────────

export interface TimeframeData {
  timeframe: string;
  candle_count: number;
  current_price: number;
  ohlc_last: { open: number; high: number; low: number; close: number };
  // Last 20 raw candles — AI can read price action directly
  ohlc_recent: Array<{ open: number; high: number; low: number; close: number; epoch: number }>;
  atr_percentile: number | null;

  // ── EMA variants — AI selects which is most relevant ──
  ema_8: number | null;
  ema_13: number | null;
  ema_20: number | null;
  ema_21: number | null;
  ema_34: number | null;
  ema_50: number | null;
  ema_89: number | null;
  ema_100: number | null;
  ema_200: number | null;

  // ── RSI variants ──
  rsi_7: number | null;
  rsi_9: number | null;
  rsi_14: number | null;
  rsi_21: number | null;
  rsi_condition: string;    // based on rsi_14

  // ── MACD variants ──
  macd: MACDResult | null;             // standard: 12,26,9
  macd_fast: MACDResult | null;        // fast: 5,13,4 (more responsive)
  macd_signal: string;

  // ── Bollinger Bands variants ──
  bollinger: BollingerBand | null;     // 20 period, 2σ (standard)
  bollinger_tight: BollingerBand | null; // 20 period, 1σ (inner band)
  bb_position: string;

  // ── ATR variants ──
  atr_7: number | null;
  atr_14: number | null;
  atr_21: number | null;

  // ── Other oscillators ──
  stochastic: StochasticResult | null;
  stoch_fast: StochasticResult | null; // fast stochastic: 5,3,3
  stoch_condition: string;
  ichimoku: IchimokuResult | null;
  fibonacci: FibonacciLevels | null;
  williams_r: number | null;
  williams_r_condition: string;
  cci_14: number | null;               // short period for faster signals
  cci_20: number | null;
  cci_condition: string;

  trend: string;
  patterns: CandlePattern[];
  support_levels: number[];
  resistance_levels: number[];
}

export function buildTimeframeData(label: string, candles: Candle[]): TimeframeData {
  const nullBase: TimeframeData = {
    timeframe: label,
    candle_count: candles.length,
    current_price: candles[candles.length - 1]?.close ?? 0,
    ohlc_last: { open: 0, high: 0, low: 0, close: 0 },
    ohlc_recent: [],
    atr_percentile: null,
    ema_8: null, ema_13: null, ema_20: null, ema_21: null, ema_34: null,
    ema_50: null, ema_89: null, ema_100: null, ema_200: null,
    rsi_7: null, rsi_9: null, rsi_14: null, rsi_21: null, rsi_condition: "N/A",
    macd: null, macd_fast: null, macd_signal: "N/A",
    bollinger: null, bollinger_tight: null, bb_position: "N/A",
    atr_7: null, atr_14: null, atr_21: null,
    stochastic: null, stoch_fast: null, stoch_condition: "N/A",
    ichimoku: null,
    fibonacci: null,
    williams_r: null, williams_r_condition: "N/A",
    cci_14: null, cci_20: null, cci_condition: "N/A",
    trend: "N/A",
    patterns: [],
    support_levels: [],
    resistance_levels: [],
  };

  if (candles.length < 5) return nullBase;

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];

  // ── EMA variants ──
  const emaV8   = ema(closes, 8);
  const emaV13  = ema(closes, 13);
  const emaV20  = ema(closes, 20);
  const emaV21  = ema(closes, 21);
  const emaV34  = ema(closes, 34);
  const emaV50  = ema(closes, 50);
  const emaV89  = ema(closes, 89);
  const emaV100 = ema(closes, 100);
  const emaV200 = ema(closes, 200);

  // ── RSI variants ──
  const rsiV7  = rsi(closes, 7);
  const rsiV9  = rsi(closes, 9);
  const rsiV14 = rsi(closes, 14);
  const rsiV21 = rsi(closes, 21);

  // ── MACD variants ──
  const macdStd  = macd(closes, 12, 26, 9);   // standard
  const macdFast = macd(closes, 5, 13, 4);    // fast / scalp

  // ── Bollinger Bands variants ──
  const bbStd   = bollingerBands(closes, 20, 2);   // standard outer bands
  const bbTight = bollingerBands(closes, 20, 1);   // tight inner bands

  // ── ATR variants ──
  const atrV7  = atr(candles, 7);
  const atrV14 = atr(candles, 14);
  const atrV21 = atr(candles, 21);

  // ── Stochastic variants ──
  const stochStd  = stochastic(candles, 14, 3, 3);  // standard
  const stochFast = stochastic(candles, 5, 3, 3);   // fast

  // ── Other indicators ──
  const ichimokuResult = ichimoku(candles);
  const fibResult = fibonacciRetracement(candles);
  const wrValues = williamsR(candles, 14);
  const cciV14 = cci(candles, 14);
  const cciV20 = cci(candles, 20);
  const structure = analyzeStructure(candles);
  const patterns = detectPatterns(candles);

  // ── Last values ──
  const lastRsi14  = rsiV14.at(-1) ?? null;
  const lastMacd   = macdStd.at(-1) ?? null;
  const lastMacdF  = macdFast.at(-1) ?? null;
  const lastBb     = bbStd.at(-1) ?? null;
  const lastBbT    = bbTight.at(-1) ?? null;
  const lastStoch  = stochStd.at(-1) ?? null;
  const lastStochF = stochFast.at(-1) ?? null;
  const lastWr     = wrValues.at(-1) ?? null;
  const lastCci14  = cciV14.at(-1) ?? null;
  const lastCci20  = cciV20.at(-1) ?? null;

  // ── Conditions (descriptive labels for fast reading) ──
  const rsiCondition = lastRsi14
    ? lastRsi14 > 70 ? "Overbought" : lastRsi14 < 30 ? "Oversold" : "Neutral"
    : "N/A";

  const macdSignal = lastMacd
    ? lastMacd.histogram > 0 ? "Bullish (histogram positive)" : "Bearish (histogram negative)"
    : "N/A";

  let bbPosition = "N/A";
  if (lastBb) {
    if (last.close > lastBb.upper) bbPosition = "Above upper band (overbought)";
    else if (last.close < lastBb.lower) bbPosition = "Below lower band (oversold)";
    else if (last.close > lastBb.middle) bbPosition = "Upper half (above middle)";
    else bbPosition = "Lower half (below middle)";
  }

  const stochCondition = lastStoch
    ? lastStoch.k > 80 ? "Overbought" : lastStoch.k < 20 ? "Oversold" : "Neutral"
    : "N/A";

  const wrCondition = lastWr !== null
    ? lastWr <= -80 ? "Oversold" : lastWr >= -20 ? "Overbought" : "Neutral"
    : "N/A";

  const cciCondition = lastCci20 !== null
    ? lastCci20 > 100 ? "Overbought" : lastCci20 < -100 ? "Oversold" : "Neutral"
    : "N/A";

  return {
    timeframe: label,
    candle_count: candles.length,
    current_price: last.close,
    ohlc_last: { open: last.open, high: last.high, low: last.low, close: last.close },
    // Last 20 raw candles for AI to read price action directly
    ohlc_recent: candles.slice(-20).map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close, epoch: c.epoch })),
    atr_percentile: (() => {
      if (atrV14.length < 20) return null;
      const recent = atrV14.slice(-20);
      const mean = recent.reduce((a, b) => a + b, 0) / 20;
      const cur = atrV14.at(-1)!;
      return mean > 0 ? parseFloat(((cur / mean) * 100).toFixed(1)) : null;
    })(),
    // EMA variants
    ema_8:   emaV8.at(-1)   ?? null,
    ema_13:  emaV13.at(-1)  ?? null,
    ema_20:  emaV20.at(-1)  ?? null,
    ema_21:  emaV21.at(-1)  ?? null,
    ema_34:  emaV34.at(-1)  ?? null,
    ema_50:  emaV50.at(-1)  ?? null,
    ema_89:  emaV89.at(-1)  ?? null,
    ema_100: emaV100.at(-1) ?? null,
    ema_200: emaV200.at(-1) ?? null,
    // RSI variants
    rsi_7:  rsiV7.at(-1)  ?? null,
    rsi_9:  rsiV9.at(-1)  ?? null,
    rsi_14: lastRsi14,
    rsi_21: rsiV21.at(-1) ?? null,
    rsi_condition: rsiCondition,
    // MACD variants
    macd:      lastMacd,
    macd_fast: lastMacdF,
    macd_signal: macdSignal,
    // Bollinger Bands variants
    bollinger:       lastBb,
    bollinger_tight: lastBbT,
    bb_position: bbPosition,
    // ATR variants
    atr_7:  atrV7.at(-1)  ?? null,
    atr_14: atrV14.at(-1) ?? null,
    atr_21: atrV21.at(-1) ?? null,
    // Stochastic variants
    stochastic: lastStoch,
    stoch_fast: lastStochF,
    stoch_condition: stochCondition,
    // Others
    ichimoku: ichimokuResult,
    fibonacci: fibResult,
    williams_r: lastWr,
    williams_r_condition: wrCondition,
    cci_14: lastCci14,
    cci_20: lastCci20,
    cci_condition: cciCondition,
    trend: structure.trend,
    patterns,
    support_levels: structure.supportLevels,
    resistance_levels: structure.resistanceLevels,
  };
}
