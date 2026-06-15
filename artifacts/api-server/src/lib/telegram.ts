import TelegramBot from "node-telegram-bot-api";
import { logger } from "./logger.js";
import { getSignals, type Signal } from "./signal-store.js";
import type { OnDemandSignal } from "./ai-agent.js";

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

// ─── HTML Escape (prevent AI text from breaking Telegram HTML parser) ─────────

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Labels ───────────────────────────────────────────────────────────────────

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

// ─── Format: BUY/SELL/WAIT Signal ────────────────────────────────────────────

function renderBullBear(val: string | string[] | undefined | null, maxItems = 3): string {
  if (!val || val === "-") return "—";
  if (Array.isArray(val)) {
    return val.slice(0, maxItems).map((v, i) => `${i + 1}. ${esc(v)}`).join("\n   ");
  }
  return esc(String(val));
}

export function formatSignal(signal: Signal): string {
  const decisionEmoji =
    signal.decision === "BUY" ? "🟢" : signal.decision === "SELL" ? "🔴" : "⏸️";
  const confidencePct = Math.round(signal.confidence * 100);
  const filled = Math.round(confidencePct / 10);
  const confidenceBar = "█".repeat(filled) + "░".repeat(10 - filled);

  const ts = new Date(signal.timestamp).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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
      `🧭 Bias Timeframe:\n  H4 ${biasH4}  H1 ${biasH1}  M15 ${biasM15}\n\n` +
      `📋 <i>${esc(signal.market_context)}</i>\n\n` +
      `💬 <b>Analisis Atlas:</b>\n${esc(signal.reasoning)}\n\n` +
      `⚖️ <b>Bull:</b> <i>${renderBullBear(signal.bull_case, 2)}</i>\n` +
      `⚖️ <b>Bear:</b> <i>${renderBullBear(signal.bear_case, 2)}</i>\n` +
      (signal.lesson && signal.lesson !== "-" ? `💡 <b>Lesson:</b> <i>${esc(signal.lesson)}</i>\n\n` : "\n") +
      `⏰ ${ts} WIB`
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
    ? `\n\n⚠️ <b>Invalidasi:</b> <i>${esc(signal.invalidation)}</i>`
    : "";

  const bullBrief = renderBullBear(signal.bull_case, 1);
  const bearBrief = renderBullBear(signal.bear_case, 1);
  const bullBearLine = bullBrief !== "—" || bearBrief !== "—"
    ? `\n\n⚖️ Bull: <i>${bullBrief}</i>\n⚖️ Bear: <i>${bearBrief}</i>`
    : "";
  const lessonLine = signal.lesson && signal.lesson !== "-"
    ? `\n💡 <i>${esc(signal.lesson)}</i>`
    : "";

  // Show TP1/TP2 info for non-WAIT signals
  const entryNum = signal.entry_price ?? signal.current_price;
  const tpNum = signal.take_profit;
  let tp1tp2Text = "";
  if (tpNum) {
    const tp1 = signal.decision === "BUY"
      ? entryNum + (tpNum - entryNum) * 0.5
      : entryNum - (entryNum - tpNum) * 0.5;
    tp1tp2Text = `\n🎯 TP1 (50%): <b>$${tp1.toFixed(2)}</b>  →  TP2 (final): <b>$${tpNum.toFixed(2)}</b>`;
  }

  return (
    `${decisionEmoji} <b>ATLAS — ${signal.decision} | XAUUSD</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💹 Harga: <b>$${signal.current_price.toFixed(2)}</b>\n` +
    `🗺️ Fase Pasar: <b>${phaseLabel}</b>\n` +
    `📊 Confidence: <b>${confidencePct}%</b> [${confidenceBar}]\n` +
    `🔗 Confluence: <b>${confluenceScore}/10</b> [${confluenceBar}]\n\n` +
    `🧭 Bias Timeframe:\n  H4 ${biasH4}  H1 ${biasH1}  M15 ${biasM15}\n\n` +
    `💰 Entry: <b>$${entry}</b>\n` +
    tp1tp2Text + "\n" +
    `🛡️ Stop Loss: <b>$${sl}</b>` +
    rrText +
    levelsText +
    `\n\n` +
    `📋 <i>${esc(signal.market_context)}</i>\n\n` +
    `💬 <b>Analisis Atlas:</b>\n${esc(signal.reasoning)}` +
    invalidation +
    bullBearLine +
    lessonLine +
    `\n\n⏰ ${ts} WIB`
  );
}

// ─── Format: Scheduled WAIT Brief ────────────────────────────────────────────

export function formatWaitBrief(signal: Signal): string {
  const confidencePct = Math.round(signal.confidence * 100);
  const filled = Math.round(confidencePct / 10);
  const confidenceBar = "█".repeat(filled) + "░".repeat(10 - filled);
  const confluenceScore = signal.confluence_score ?? 0;

  const ts = new Date(signal.timestamp).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit", minute: "2-digit",
  });

  const phaseLabel = PHASE_LABEL[signal.market_phase] ?? signal.market_phase ?? "-";
  const biasH4 = BIAS_EMOJI[signal.timeframe_bias?.H4 ?? "NEUTRAL"] ?? "⚪";
  const biasH1 = BIAS_EMOJI[signal.timeframe_bias?.H1 ?? "NEUTRAL"] ?? "⚪";
  const biasM15 = BIAS_EMOJI[signal.timeframe_bias?.M15 ?? "NEUTRAL"] ?? "⚪";

  const decisionEmoji = signal.decision === "BUY" ? "🟢" : signal.decision === "SELL" ? "🔴" : "⏸️";
  const decisionLabel = signal.decision === "WAIT"
    ? "WAIT — Belum ada setup valid"
    : `${signal.decision} (confidence belum cukup: ${confidencePct}%)`;

  const renderList = (val: string | string[] | undefined | null): string => {
    if (!val || val === "-") return "  —";
    if (Array.isArray(val)) {
      return val.slice(0, 2).map((v) => `  • ${esc(v)}`).join("\n");
    }
    return `  • ${esc(String(val))}`;
  };

  const lesson = signal.lesson && signal.lesson !== "-" ? signal.lesson : null;
  const wtcmm = signal.what_would_change_my_mind;
  const wtcmmText = wtcmm && wtcmm !== "-"
    ? (Array.isArray(wtcmm) ? wtcmm[0] : String(wtcmm))
    : null;

  return (
    `${decisionEmoji} <b>ATLAS | XAUUSD — ${decisionLabel}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💹 Harga: <b>$${signal.current_price.toFixed(2)}</b>  |  🗺️ <b>${phaseLabel}</b>\n` +
    `📊 ${confidencePct}% [${confidenceBar}]  🔗 ${confluenceScore}/10\n` +
    `🧭 H4 ${biasH4}  H1 ${biasH1}  M15 ${biasM15}\n\n` +
    `📋 <i>${esc(signal.market_context)}</i>\n\n` +
    `🟢 <b>Bull Case:</b>\n${renderList(signal.bull_case)}\n\n` +
    `🔴 <b>Bear Case:</b>\n${renderList(signal.bear_case)}\n` +
    (wtcmmText ? `\n🔄 <b>Pemicu arah:</b> <i>${esc(wtcmmText)}</i>\n` : "") +
    (lesson ? `\n💡 <b>Lesson:</b> <i>${esc(lesson)}</i>\n` : "") +
    `\n⏰ ${ts} WIB  •  Analisis berikutnya: ~5 mnt`
  );
}

// ─── Format: TP1 Partial Hit ──────────────────────────────────────────────────

export function formatPartialTP(
  signal: Signal,
  currentPrice: number,
  tp1: number,
  tp2: number
): string {
  const ts = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const entryPrice = signal.entry_price ?? signal.current_price;
  const profitSoFar = Math.abs(currentPrice - entryPrice).toFixed(2);
  const remainingToTP2 = Math.abs(tp2 - currentPrice).toFixed(2);

  return (
    `🎯 <b>ATLAS — TP1 HIT! Target 50% Tercapai ✅</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 Sinyal: <b>${signal.decision} XAUUSD</b>\n` +
    `💰 Entry: <b>$${entryPrice.toFixed(2)}</b>\n` +
    `🎯 TP1 Hit: <b>$${currentPrice.toFixed(2)}</b> (+${profitSoFar} pip)\n\n` +
    `🔄 <b>Adjustment Otomatis:</b>\n` +
    `  🛡️ SL dipindah ke Breakeven: <b>$${entryPrice.toFixed(2)}</b>\n` +
    `  🎯 Menunggu TP2: <b>$${tp2.toFixed(2)}</b> (${remainingToTP2} pip lagi)\n\n` +
    `💬 <i>Posisi sekarang terlindungi. Risiko = NOL. Menunggu TP2...</i>\n\n` +
    `⏰ ${ts} WIB`
  );
}

// ─── Format: WIN / LOSS / Breakeven ──────────────────────────────────────────

export function formatResult(
  signal: Signal,
  result: "WIN" | "LOSS",
  exitPrice: number,
  isBreakeven = false
): string {
  const ts = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const entryPrice = signal.entry_price ?? signal.current_price;
  const rawPips = signal.decision === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pipsLabel = isBreakeven
    ? "±0.00 (modal aman)"
    : (rawPips >= 0 ? "+" : "") + rawPips.toFixed(2);

  const duration = signal.exit_time
    ? Math.round(
        (new Date(signal.exit_time).getTime() - new Date(signal.timestamp).getTime()) / 60000
      )
    : null;

  let header: string;
  if (isBreakeven) {
    header = `⚖️ <b>ATLAS — BREAKEVEN | SL hit setelah TP1 (Modal Aman) ✅</b>\n`;
  } else if (result === "WIN") {
    header = `🏆 <b>ATLAS — PROFIT | TAKE PROFIT HIT ✅</b>\n`;
  } else {
    header = `💔 <b>ATLAS — LOSS | STOP LOSS HIT ❌</b>\n`;
  }

  return (
    header +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 Sinyal: <b>${signal.decision} XAUUSD</b>\n` +
    `💰 Entry: <b>$${entryPrice.toFixed(2)}</b>\n` +
    `${isBreakeven ? "⚖️" : result === "WIN" ? "🎯" : "🛑"} Exit: <b>$${exitPrice.toFixed(2)}</b>\n` +
    `📊 P&L: <b>${pipsLabel} pips</b>\n` +
    (duration !== null ? `⏱️ Durasi: <b>${duration} menit</b>\n` : "") +
    `\n⏰ ${ts} WIB\n\n` +
    `▶️ <i>Atlas melanjutkan analisis otomatis setiap 5 menit...</i>`
  );
}

// ─── On-Demand Chat Signal Formatter ─────────────────────────────────────────

export function formatChatSignal(s: OnDemandSignal, userQuery: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });

  const setupEmoji =
    s.setup_type === "IMMEDIATE_ENTRY" ? "⚡" :
    s.setup_type === "PENDING_SETUP" ? "⏳" : "🔍";

  const setupLabel =
    s.setup_type === "IMMEDIATE_ENTRY" ? "ENTRY SEKARANG" :
    s.setup_type === "PENDING_SETUP" ? "PENDING SETUP" : "TIDAK ADA SETUP";

  const dirEmoji = s.decision === "BUY" ? "🟢" : s.decision === "SELL" ? "🔴" : "⏸️";
  const confPct = Math.round(s.confidence * 100);
  const confBar = confPct >= 80 ? "🔥" : confPct >= 65 ? "✅" : confPct >= 50 ? "⚡" : "⚠️";

  let header = `🗣️ <b>ATLAS — ANALISIS ON-DEMAND</b>\n`;
  header += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  header += `📝 <i>"${esc(userQuery)}"</i>\n`;
  if (s.strategy_label && s.strategy_label !== "-") {
    header += `🎯 Strategi: <b>${esc(s.strategy_label)}</b>\n`;
  }
  header += `\n${setupEmoji} <b>${setupLabel}</b>  ${dirEmoji} ${s.decision}\n`;
  header += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (s.setup_type === "NO_SETUP") {
    let body = header;
    body += `\n📊 Fase: <b>${esc(s.market_phase)}</b>\n`;
    body += `🧠 Reasoning:\n${esc(s.reasoning)}\n\n`;
    if (s.what_would_change_my_mind && s.what_would_change_my_mind !== "-") {
      body += `🔄 <b>Yang perlu terjadi:</b>\n${esc(s.what_would_change_my_mind)}\n\n`;
    }
    body += `⏰ ${now} WIB`;
    return body;
  }

  // IMMEDIATE_ENTRY or PENDING_SETUP
  let body = header;
  body += `\n📊 Fase: <b>${esc(s.market_phase)}</b>  |  Konfiden: <b>${confPct}%</b> ${confBar}\n`;
  body += `⚖️ Konfluensi: <b>${s.confluence_score ?? "-"}/10</b>\n`;

  if (s.setup_type === "PENDING_SETUP") {
    const orderTypeLabel: Record<string, string> = {
      BUY_LIMIT: "BUY LIMIT ↙️ (tunggu harga turun ke level ini)",
      SELL_LIMIT: "SELL LIMIT ↗️ (tunggu harga naik ke level ini)",
      BUY_STOP: "BUY STOP ↗️ (tunggu breakout naik)",
      SELL_STOP: "SELL STOP ↙️ (tunggu breakout turun)",
    };
    const orderLabel = s.pending_order_type ? (orderTypeLabel[s.pending_order_type] ?? s.pending_order_type) : "-";
    body += `\n📋 Order: <b>${orderLabel}</b>\n`;
    body += `💰 Level Entry Pending: <b>$${s.entry_price?.toFixed(2) ?? "-"}</b>\n`;
    body += `🎯 TP: <b>$${s.take_profit?.toFixed(2) ?? "-"}</b>  🛑 SL: <b>$${s.stop_loss?.toFixed(2) ?? "-"}</b>\n`;
    const rr = s.risk_reward_ratio?.toFixed(2) ?? "-";
    body += `📐 R:R = <b>${rr}</b>\n`;
    if (s.pending_trigger && s.pending_trigger !== "-") {
      body += `\n🔔 <b>Konfirmasi diperlukan:</b>\n${esc(s.pending_trigger)}\n`;
    }
  } else {
    // IMMEDIATE_ENTRY
    body += `\n💰 Entry: <b>$${s.entry_price?.toFixed(2) ?? "-"}</b>\n`;
    body += `🎯 TP: <b>$${s.take_profit?.toFixed(2) ?? "-"}</b>  🛑 SL: <b>$${s.stop_loss?.toFixed(2) ?? "-"}</b>\n`;
    const rr = s.risk_reward_ratio?.toFixed(2) ?? "-";
    body += `📐 R:R = <b>${rr}</b>\n`;
  }

  body += `\n🧠 Reasoning:\n${esc(s.reasoning)}\n`;

  const bullCase = s.bull_case && s.bull_case !== "-" ? s.bull_case : null;
  const bearCase = s.bear_case && s.bear_case !== "-" ? s.bear_case : null;
  if (bullCase || bearCase) {
    body += `\n`;
    if (bullCase) body += `🐂 Bull: ${esc(bullCase)}\n`;
    if (bearCase) body += `🐻 Bear: ${esc(bearCase)}\n`;
  }

  if (s.invalidation && s.invalidation !== "-") {
    body += `\n❌ Invalidasi: ${esc(s.invalidation)}\n`;
  }

  if (s.what_would_change_my_mind && s.what_would_change_my_mind !== "-") {
    body += `🔄 Ubah pandangan jika: ${esc(s.what_would_change_my_mind)}\n`;
  }

  const supportLevels = s.key_levels?.nearest_support;
  const resistanceLevels = s.key_levels?.nearest_resistance;
  if (supportLevels || resistanceLevels) {
    body += `\n📍 Support: <b>$${supportLevels ?? "-"}</b>  Resist: <b>$${resistanceLevels ?? "-"}</b>\n`;
  }

  body += `\n⚠️ <i>On-demand — bukan sinyal resmi bot. Selalu kelola risiko sendiri.</i>\n`;
  body += `⏰ ${now} WIB`;
  return body;
}

// ─── Command Registration ─────────────────────────────────────────────────────

export function registerCommands(
  onAnalyze: () => Promise<Signal | null>,
  onStatus: () => object,
  onPause: () => void,
  onResume: () => void,
  onChat: (query: string) => Promise<OnDemandSignal>
): void {
  if (!bot) return;

  bot.onText(/\/(start|help)/, async (msg) => {
    const chatId = msg.chat.id.toString();
    await sendMessage(
      `🤖 <b>XAUUSD AI Trading Bot — Atlas</b>\n\n` +
        `Bot otonom yang menganalisis pasar emas setiap 5 menit menggunakan AI multi-timeframe.\n\n` +
        `<b>Perintah tersedia:</b>\n` +
        `/analyze — Analisis pasar sekarang (mode otomatis)\n` +
        `/chat [pertanyaan] — Tanya Atlas langsung (analisis on-demand)\n` +
        `/status — Status bot, mode, sinyal aktif, win rate\n` +
        `/history — Riwayat 5 sinyal terakhir\n` +
        `/pause — Hentikan analisis otomatis\n` +
        `/resume — Lanjutkan analisis otomatis\n` +
        `/help — Tampilkan bantuan ini\n\n` +
        `💡 <b>Contoh /chat:</b>\n` +
        `<code>/chat cari setup sell terbaik saat ini</code>\n` +
        `<code>/chat ada peluang scalping hari ini?</code>\n` +
        `<code>/chat level support kuat di mana?</code>`,
      chatId
    );
  });

  bot.onText(/\/chat(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const userQuery = match?.[1]?.trim() || "Cari peluang trading terbaik saat ini";
    await sendMessage(`⏳ <b>Atlas sedang menganalisis...</b>\n📝 <i>"${esc(userQuery)}"</i>`, chatId);
    try {
      const signal = await onChat(userQuery);
      await sendMessage(formatChatSignal(signal, userQuery), chatId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      if (errMsg === "market_closed" || errMsg.toLowerCase().includes("closed")) {
        await sendMessage(
          "🔒 <b>Pasar XAUUSD Sedang Tutup</b>\n\n" +
            "Analisis on-demand tidak tersedia saat pasar tutup.\n" +
            "📅 Buka kembali: Senin – Jumat mulai <b>07:00 WIB</b>.",
          chatId
        );
      } else {
        await sendMessage(`❌ Analisis gagal: ${esc(errMsg)}`, chatId);
      }
    }
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
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      if (errMsg === "market_closed" || errMsg.toLowerCase().includes("closed")) {
        await sendMessage(
          "🔒 <b>Pasar XAUUSD Deriv Sedang Tutup</b>\n\n" +
            "📅 <b>Jadwal Deriv frxXAUUSD:</b>\n" +
            "• Buka: Senin – Jumat, mulai <b>07:00 WIB</b> (00:00 UTC)\n" +
            "• Tutup: Sabtu dini hari s/d Senin 07:00 WIB\n" +
            "• Jumat tutup lebih awal pukul ~03:55 WIB (20:55 UTC)\n\n" +
            "⏰ Bot akan otomatis menganalisis ≤5 menit setelah pasar buka.",
          chatId
        );
      } else if (errMsg === "analysis_in_progress") {
        await sendMessage(
          "⏳ <b>Analisis sedang berjalan</b>\n\n" +
            "Bot sedang memproses siklus analisis otomatis saat ini.\n" +
            "Hasilnya akan muncul dalam beberapa detik — tidak perlu mengirim ulang.",
          chatId
        );
      } else {
        await sendMessage(`❌ Error: ${errMsg}`, chatId);
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
      activeSignal: {
        decision: string;
        entry_price?: number;
        take_profit?: number;
        stop_loss?: number;
        timestamp: string;
      } | null;
      monitorState: {
        tp1: number;
        tp2: number;
        trailingSL: number;
        tp1Hit: boolean;
      } | null;
      winRate: { wins: number; losses: number; rate: number };
    };

    const modeLabel =
      status.mode === "MONITORING"
        ? "🔭 MONITORING sinyal aktif"
        : "🔍 ANALYZING (analisis otomatis)";

    let activeInfo = "";
    if (status.activeSignal && status.monitorState) {
      const a = status.activeSignal;
      const ms = status.monitorState;
      const since = new Date(a.timestamp).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit",
      });
      activeInfo =
        `\n📌 Sinyal Aktif: <b>${a.decision}</b> sejak ${since} WIB\n` +
        `   💰 Entry: <b>$${(a.entry_price ?? 0).toFixed(2)}</b>\n` +
        `   🎯 TP1: <b>$${ms.tp1.toFixed(2)}</b>${ms.tp1Hit ? " ✅ HIT" : ""}\n` +
        `   🎯 TP2: <b>$${ms.tp2.toFixed(2)}</b>\n` +
        `   🛡️ Trailing SL: <b>$${ms.trailingSL.toFixed(2)}</b>${ms.tp1Hit ? " (breakeven)" : ""}\n`;
    } else if (status.activeSignal) {
      const a = status.activeSignal;
      const since = new Date(a.timestamp).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit",
      });
      activeInfo =
        `\n📌 Sinyal Aktif: <b>${a.decision}</b> sejak ${since} WIB\n` +
        `   🎯 TP: <b>$${a.take_profit?.toFixed(2) ?? "-"}</b>  🛑 SL: <b>$${a.stop_loss?.toFixed(2) ?? "-"}</b>\n`;
    }

    const nextInfo =
      status.mode === "MONITORING"
        ? "⏳ Menunggu trigger TP1/TP2/SL..."
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

  bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const recent = getSignals(5);

    if (recent.length === 0) {
      await sendMessage("📋 Belum ada riwayat sinyal.", chatId);
      return;
    }

    const lines: string[] = [`📋 <b>ATLAS — Riwayat 5 Sinyal Terakhir</b>\n━━━━━━━━━━━━━━━━━━━━━━━━`];

    recent.forEach((s, i) => {
      const timeStr = new Date(s.timestamp).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit",
      });

      const decisionEmoji =
        s.decision === "BUY" ? "🟢" : s.decision === "SELL" ? "🔴" : "⏸️";
      const confPct = Math.round(s.confidence * 100);

      let resultTag = "";
      if (s.result === "WIN") {
        const pips = s.exit_price
          ? (s.decision === "BUY" ? s.exit_price - (s.entry_price ?? s.current_price) : (s.entry_price ?? s.current_price) - s.exit_price)
          : 0;
        resultTag = ` → ✅ WIN (+${pips.toFixed(2)})`;
      } else if (s.result === "LOSS") {
        const pips = s.exit_price
          ? Math.abs(s.exit_price - (s.entry_price ?? s.current_price))
          : 0;
        resultTag = ` → ❌ LOSS (-${pips.toFixed(2)})`;
      } else if (s.status === "active") {
        resultTag = " → ⏳ AKTIF";
      }

      lines.push(
        `${i + 1}. ${decisionEmoji} <b>${s.decision}</b> | $${s.current_price.toFixed(2)} | ${confPct}% | ${timeStr}${resultTag}`
      );
    });

    const { wins, losses, rate } = (() => {
      const closed = recent.filter((s) => s.result);
      const w = closed.filter((s) => s.result === "WIN").length;
      const l = closed.filter((s) => s.result === "LOSS").length;
      return { wins: w, losses: l, rate: closed.length > 0 ? Math.round((w / closed.length) * 100) : 0 };
    })();

    if (wins + losses > 0) {
      lines.push(`\n📊 Win Rate (5 sinyal): <b>${wins}W / ${losses}L = ${rate}%</b>`);
    }

    const now = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta", day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
    lines.push(`⏰ Update: ${now} WIB`);

    await sendMessage(lines.join("\n"), chatId);
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
