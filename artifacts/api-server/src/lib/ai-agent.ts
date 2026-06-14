import type { TimeframeData } from "./indicators.js";
import { logger } from "./logger.js";

const AI_API_URL = process.env.AI_API_URL ?? "https://qwn-api--miok1qpgd.replit.app/v1/chat/completions";
const AI_API_KEY = process.env.AI_API_KEY ?? "";
const AI_MODEL = process.env.AI_MODEL ?? "qwen3.7-max";

const SYSTEM_PROMPT = `Anda adalah seorang Ahli Trader Emas (XAUUSD) dengan pengalaman lebih dari 20 tahun di pasar global. 
Tugas Anda adalah menganalisis "Sensory Data" yang diberikan (indikator teknikal, price action, struktur pasar dari berbagai timeframe) dan memberikan keputusan trading yang otonom.

PRINSIP ANALISIS ANDA:
1. Kesadaran Pasar: Jangan hanya melihat angka, pahami konteksnya. Apakah pasar sedang trending, konsolidasi, atau volatil?
2. Konfirmasi Multi-Timeframe: Selalu bandingkan kondisi di timeframe yang lebih besar (H4/H1) dengan timeframe entry (M15/M5).
3. Manajemen Risiko: Utamakan keamanan modal. Jangan berikan sinyal jika kondisi pasar tidak jelas atau berisiko tinggi.
4. Penalaran Naratif: Berikan penjelasan logis mengapa Anda mengambil keputusan tersebut.

FORMAT OUTPUT:
Anda harus merespons dalam format JSON yang valid agar dapat diproses oleh sistem:
{
    "decision": "BUY" | "SELL" | "WAIT",
    "confidence": 0.0 sampai 1.0,
    "entry_price": float atau null,
    "take_profit": float atau null,
    "stop_loss": float atau null,
    "reasoning": "Penjelasan detail dalam Bahasa Indonesia tentang analisis Anda",
    "market_context": "Deskripsi singkat kondisi pasar saat ini (misal: Bullish Trend, Range-bound, High Volatility)"
}

PENTING: 
- Jika decision adalah "WAIT", maka entry_price, take_profit, dan stop_loss harus null.
- Berikan target profit dan stop loss yang realistis berdasarkan ATR dan level support/resistance yang terlihat dari data.
- Gunakan Bahasa Indonesia yang profesional dan mudah dimengerti.
- HANYA output JSON, tidak ada teks lain sebelum atau sesudah JSON.`;

export interface AISignal {
  decision: "BUY" | "SELL" | "WAIT";
  confidence: number;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  reasoning: string;
  market_context: string;
}

export async function analyzeMarket(timeframes: TimeframeData[], currentPrice: number): Promise<AISignal> {
  const sensoryData = {
    symbol: "XAUUSD",
    current_price: currentPrice,
    analysis_time: new Date().toISOString(),
    timeframes: timeframes.map((tf) => ({
      timeframe: tf.timeframe,
      current_price: tf.current_price,
      ohlc_last_candle: tf.ohlc_last,
      trend: tf.trend,
      indicators: {
        ema_20: tf.ema_20?.toFixed(2),
        ema_50: tf.ema_50?.toFixed(2),
        ema_200: tf.ema_200?.toFixed(2),
        rsi_14: tf.rsi_14?.toFixed(2),
        rsi_condition: tf.rsi_condition,
        macd: tf.macd
          ? {
              line: tf.macd.macd.toFixed(4),
              signal: tf.macd.signal.toFixed(4),
              histogram: tf.macd.histogram.toFixed(4),
            }
          : null,
        macd_signal: tf.macd_signal,
        bollinger_bands: tf.bollinger
          ? {
              upper: tf.bollinger.upper.toFixed(2),
              middle: tf.bollinger.middle.toFixed(2),
              lower: tf.bollinger.lower.toFixed(2),
              bandwidth: tf.bollinger.bandwidth.toFixed(4),
            }
          : null,
        bb_price_position: tf.bb_position,
        atr_14: tf.atr_14?.toFixed(2),
        stochastic: tf.stochastic
          ? {
              k: tf.stochastic.k.toFixed(2),
              d: tf.stochastic.d.toFixed(2),
            }
          : null,
        stochastic_condition: tf.stoch_condition,
      },
      price_action: {
        candlestick_patterns: tf.patterns.map((p) => `${p.name} (${p.type})`),
        key_support_levels: tf.support_levels.map((s) => s.toFixed(2)),
        key_resistance_levels: tf.resistance_levels.map((r) => r.toFixed(2)),
      },
    })),
  };

  const userMessage = `Analisis data pasar XAUUSD berikut dan berikan keputusan trading:\n\n${JSON.stringify(sensoryData, null, 2)}`;

  const response = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      stream: false,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content ?? "";

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error({ content }, "AI returned non-JSON response");
    throw new Error("AI did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AISignal;

  if (!["BUY", "SELL", "WAIT"].includes(parsed.decision)) {
    throw new Error(`Invalid decision: ${parsed.decision}`);
  }

  if (parsed.decision === "WAIT") {
    parsed.entry_price = null;
    parsed.take_profit = null;
    parsed.stop_loss = null;
  }

  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

  return parsed;
}
