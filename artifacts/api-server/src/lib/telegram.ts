import TelegramBot from "node-telegram-bot-api";
import { logger } from "./logger.js";
import type { Signal } from "./signal-store.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

let bot: TelegramBot | null = null;

export function initTelegram(): TelegramBot | null {
  if (!TOKEN) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram disabled");
    return null;
  }
  if (bot) return bot;

  bot = new TelegramBot(TOKEN, { polling: true });

  bot.on("polling_error", (err) => {
    logger.error({ err: err.message }, "Telegram polling error");
  });

  logger.info("Telegram bot initialized");
  return bot;
}

export function getBot(): TelegramBot | null {
  return bot;
}

export async function sendMessage(text: string, chatId?: string): Promise<void> {
  const target = chatId ?? CHAT_ID;
  if (!bot || !target) return;
  try {
    await bot.sendMessage(target, text, { parse_mode: "HTML" });
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram message");
  }
}

const PHASE_LABEL: Record<string, string> = {
  TRENDING_UP: "📈 Trending Naik",
  TRENDING_DOWN: "📉 Trending Turun",
  RANGING: "↔️ Ranging",
  CONSOLIDATION: "🔄 Konsolidasi",
  VOLATILE: "⚡ Volatil",
  DISTRIBUTION: "🏦 Distribusi",
  ACCUMULATION: "🏗️ Akumulasi",
};

const BIAS_EMOJI: Record<string, string> = {
  BULLISH: "🟢",
  BEARISH: "🔴",
  NEUTRAL: "⚪",
};

export function formatSignal(signal: Signal): string {
  const decisionEmoji =
    signal.decision === "BUY" ? "🟢" : signal.decision === "SELL" ? "🔴" : "⏸️";
  const confidencePct = Math.round(signal.confidence * 100);
  const filled = Math.round(confidencePct / 10);
  const confidenceBar = "█".repeat(filled) + "░".repeat(10 - filled);

  const ts = new Date(signal.timestamp);
  const timeStr = ts.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const phaseLabel = PHASE_LABEL[signal.market_phase] ?? signal.market_phase ?? "-";

  const biasH4 = BIAS_EMOJI[signal.timeframe_bias?.H4 ?? "NEUTRAL"] ?? "⚪";
  const biasH1 = BIAS_EMOJI[signal.timeframe_bias?.H1 ?? "NEUTRAL"] ?? "⚪";
  const biasM15 = BIAS_EMOJI[signal.timeframe_bias?.M15 ?? "NEUTRAL"] ?? "⚪";

  const confluenceScore = signal.confluence_score ?? 0;
  const confluenceBar = "■".repeat(confluenceScore) + "□".repeat(Math.max(0, 10 - confluenceScore));

  if (signal.decision === "WAIT") {
    return (
      `⏸️ <b>ATLAS — WAIT | XAUUSD</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💹 Harga: <b>$${signal.current_price.toFixed(2)}</b>\n` +
      `🗺️ Fase Pasar: <b>${phaseLabel}</b>\n` +
      `📊 Confidence: <b>${confidencePct}%</b> [${confidenceBar}]\n` +
      `🔗 Confluence: <b>${confluenceScore}/10</b> [${confluenceBar}]\n\n` +
      `🧭 Bias Timeframe:\n` +
      `  H4 ${biasH4}  H1 ${biasH1}  M15 ${biasM15}\n\n` +
      `📋 <i>${signal.market_context}</i>\n\n` +
      `💬 <b>Analisis Atlas:</b>\n${signal.reasoning}\n\n` +
      `⏰ ${timeStr} WIB`
    );
  }

  const entry = signal.entry_price?.toFixed(2) ?? "-";
  const tp = signal.take_profit?.toFixed(2) ?? "-";
  const sl = signal.stop_loss?.toFixed(2) ?? "-";

  let rr = signal.risk_reward_ratio?.toFixed(2);
  if (!rr && signal.entry_price && signal.take_profit && signal.stop_loss) {
    const reward = Math.abs(signal.take_profit - signal.entry_price);
    const risk = Math.abs(signal.entry_price - signal.stop_loss);
    if (risk > 0) rr = (reward / risk).toFixed(2);
  }
  const rrText = rr ? `\n📐 Risk/Reward: <b>1:${rr}</b>` : "";

  const nearRes = signal.key_levels?.nearest_resistance?.toFixed(2);
  const nearSup = signal.key_levels?.nearest_support?.toFixed(2);
  const levelsText =
    nearRes || nearSup
      ? `\n🏔️ Resistance: <b>${nearRes ?? "-"}</b>  🏔️ Support: <b>${nearSup ?? "-"}</b>`
      : "";

  const invalidation = signal.invalidation
    ? `\n\n⚠️ <b>Invalidasi:</b> <i>${signal.invalidation}</i>`
    : "";

  return (
    `${decisionEmoji} <b>ATLAS — ${signal.decision} | XAUUSD</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💹 Harga: <b>$${signal.current_price.toFixed(2)}</b>\n` +
    `🗺️ Fase Pasar: <b>${phaseLabel}</b>\n` +
    `📊 Confidence: <b>${confidencePct}%</b> [${confidenceBar}]\n` +
    `🔗 Confluence: <b>${confluenceScore}/10</b> [${confluenceBar}]\n\n` +
    `🧭 Bias Timeframe:\n` +
    `  H4 ${biasH4}  H1 ${biasH1}  M15 ${biasM15}\n\n` +
    `💰 Entry: <b>$${entry}</b>\n` +
    `🎯 Take Profit: <b>$${tp}</b>\n` +
    `🛡️ Stop Loss: <b>$${sl}</b>` +
    rrText +
    levelsText +
    `\n\n` +
    `📋 <i>${signal.market_context}</i>\n\n` +
    `💬 <b>Analisis Atlas:</b>\n${signal.reasoning}` +
    invalidation +
    `\n\n⏰ ${timeStr} WIB`
  );
}

export function formatResult(signal: Signal, result: "WIN" | "LOSS", exitPrice: number): string {
  const isWin = result === "WIN";
  const ts = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const entryPrice = signal.entry_price ?? signal.current_price;
  const rawPips = signal.decision === "BUY"
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;
  const pipsLabel = (rawPips >= 0 ? "+" : "") + rawPips.toFixed(2);

  const duration = signal.exit_time
    ? Math.round((new Date(signal.exit_time).getTime() - new Date(signal.timestamp).getTime()) / 60000)
    : null;

  return (
    (isWin
      ? `🏆 <b>ATLAS — PROFIT | TAKE PROFIT HIT ✅</b>\n`
      : `💔 <b>ATLAS — LOSS | STOP LOSS HIT ❌</b>\n`) +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 Sinyal: <b>${signal.decision} XAUUSD</b>\n` +
    `💰 Entry: <b>$${entryPrice.toFixed(2)}</b>\n` +
    `${isWin ? "🎯" : "🛑"} Exit: <b>$${exitPrice.toFixed(2)}</b>\n` +
    `📊 P&L: <b>${pipsLabel} pips</b>\n` +
    (duration !== null ? `⏱️ Durasi: <b>${duration} menit</b>\n` : "") +
    `\n⏰ ${ts} WIB\n\n` +
    `▶️ <i>Atlas melanjutkan analisis otomatis setiap 1 menit...</i>`
  );
}

export function registerCommands(
  onAnalyze: () => Promise<Signal | null>,
  onStatus: () => object,
  onPause: () => void,
  onResume: () => void
): void {
  if (!bot) return;

  bot.onText(/\/(start|help)/, async (msg) => {
    const chatId = msg.chat.id.toString();
    await sendMessage(
      `🤖 <b>XAUUSD AI Trading Bot</b>\n\n` +
        `Bot ini menganalisis pasar emas menggunakan AI dan indikator teknikal multi-timeframe.\n\n` +
        `<b>Perintah tersedia:</b>\n` +
        `/analyze — Analisis pasar sekarang\n` +
        `/status — Status bot & sinyal terakhir\n` +
        `/pause — Hentikan analisis otomatis\n` +
        `/resume — Mulai kembali analisis otomatis\n` +
        `/help — Tampilkan bantuan ini`,
      chatId
    );
  });

  bot.onText(/\/analyze/, async (msg) => {
    const chatId = msg.chat.id.toString();
    await sendMessage("⏳ Menganalisis pasar XAUUSD...", chatId);
    try {
      const signal = await onAnalyze();
      if (signal) {
        await sendMessage(formatSignal(signal), chatId);
      } else {
        await sendMessage("❌ Analisis gagal. Coba lagi nanti.", chatId);
      }
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : "Unknown error";
      if (msg2 === "market_closed" || msg2.toLowerCase().includes("closed")) {
        await sendMessage(
          "🔒 <b>Pasar XAUUSD Deriv Sedang Tutup</b>\n\n" +
            "📅 <b>Jadwal Deriv frxXAUUSD:</b>\n" +
            "• Buka: Senin – Jumat, mulai <b>07:00 WIB</b> (00:00 UTC)\n" +
            "• Tutup: Sabtu dini hari s/d Senin 07:00 WIB\n" +
            "• Jumat tutup lebih awal pukul ~03:55 WIB (20:55 UTC)\n\n" +
            "⏰ Bot akan otomatis menganalisis dalam ≤15 menit setelah pasar buka.\n" +
            "Tidak perlu melakukan apa-apa.",
          chatId
        );
      } else {
        await sendMessage(`❌ Error: ${msg2}`, chatId);
      }
    }
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const status = onStatus() as {
      running: boolean;
      paused: boolean;
      mode: string;
      totalSignals: number;
      lastAnalysis: string | null;
      nextAnalysisIn: number | null;
      activeSignal: { decision: string; entry_price?: number; take_profit?: number; stop_loss?: number; timestamp: string } | null;
      winRate: { wins: number; losses: number; rate: number };
    };

    const modeLabel =
      status.mode === "MONITORING"
        ? "🔭 MONITORING sinyal aktif"
        : "🔍 ANALYZING (analisis otomatis)";

    let activeInfo = "";
    if (status.activeSignal) {
      const a = status.activeSignal;
      const since = new Date(a.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
      activeInfo =
        `\n📌 Sinyal Aktif: <b>${a.decision}</b> sejak ${since} WIB\n` +
        `   🎯 TP: <b>$${a.take_profit?.toFixed(2) ?? "-"}</b>  🛑 SL: <b>$${a.stop_loss?.toFixed(2) ?? "-"}</b>\n`;
    }

    const nextInfo =
      status.mode === "MONITORING"
        ? "⏳ Menunggu trigger TP/SL..."
        : status.nextAnalysisIn != null
          ? `⏰ Analisis berikutnya: <b>${status.nextAnalysisIn}s lagi</b>`
          : "";

    const msg2 =
      `🤖 <b>Status Atlas Bot</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Status: ${status.running ? (status.paused ? "⏸️ Dijeda" : "🟢 Aktif") : "🔴 Nonaktif"}\n` +
      `Mode: <b>${modeLabel}</b>\n` +
      activeInfo +
      `\nTotal Sinyal: <b>${status.totalSignals}</b>\n` +
      `Win Rate: <b>${status.winRate.wins}W / ${status.winRate.losses}L (${status.winRate.rate}%)</b>\n` +
      (status.lastAnalysis
        ? `Analisis Terakhir: ${new Date(status.lastAnalysis).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB\n`
        : "") +
      nextInfo;

    await sendMessage(msg2, chatId);
  });

  bot.onText(/\/pause/, async (msg) => {
    const chatId = msg.chat.id.toString();
    onPause();
    await sendMessage("⏸️ Analisis otomatis dihentikan sementara. Ketik /resume untuk melanjutkan.", chatId);
  });

  bot.onText(/\/resume/, async (msg) => {
    const chatId = msg.chat.id.toString();
    onResume();
    await sendMessage("▶️ Analisis otomatis dilanjutkan.", chatId);
  });
}
