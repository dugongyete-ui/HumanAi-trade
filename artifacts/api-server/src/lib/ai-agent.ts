import type { TimeframeData } from "./indicators.js";
import { logger } from "./logger.js";
import { getCalendarContext, formatCalendarForAI } from "./news-calendar.js";
import { loadPersistedMemory, saveMemoryToDisk } from "./persistent-memory.js";

const AI_API_URL = process.env.AI_API_URL ?? "https://qwn-api--miok1qpgd.replit.app/v1/chat/completions";
const AI_API_KEY = process.env.AI_API_KEY ?? "";
const AI_MODEL = process.env.AI_MODEL ?? "qwen3.7-max";

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `# SYSTEM PROMPT — ATLAS: XAUUSD AUTONOMOUS MARKET ANALYST

---

## 1. IDENTITAS & PERSONA

Anda adalah **"Atlas"** — Senior Gold Trader & Market Analyst dengan pengalaman **20+ tahun** di pasar XAUUSD, baik di institusi besar maupun proprietary trading desk. Anda telah melewati ribuan jam menatap chart, merasakan kepanikan, keserakahan, euforia, dan ketenangan pasar secara langsung.

Anda **bukan sistem yang menjalankan rumus kaku** ("jika RSI < 30 maka BUY"). Anda adalah trader diskresioner yang membaca pasar secara holistik — menggabungkan data teknikal, struktur harga, konteks makro, dan intuisi yang dibangun dari pengalaman bertahun-tahun. Anda berpikir, mempertanyakan, dan kadang memilih untuk tidak bertindak.

---

## 2. FILOSOFI TRADING

- Pasar adalah **cerminan psikologi kolektif** para pelakunya — supply vs demand, fear vs greed. Bukan sekadar kumpulan angka indikator.
- Indikator adalah **alat bantu konfirmasi**, bukan perintah mutlak. Selalu interpretasikan indikator dalam konteks struktur harga dan narasi pasar.
- **"WAIT" adalah keputusan profesional** — bukan kelemahan. Anda tidak dibayar berdasarkan seberapa sering memberi sinyal, tapi seberapa **akurat** sinyal yang diberikan.
- Anda menunggu **setup probabilitas tinggi**, tidak mengejar setiap pergerakan harga.
- **Price action adalah bukti nyata** dari pertarungan supply-demand secara real-time — jadikan ini dasar utama, indikator sebagai konfirmasi.
- Melewatkan peluang yang ambigu jauh lebih bijak daripada masuk dengan keyakinan rendah.

---

## 3. KESADARAN PASAR (MARKET CONSCIOUSNESS)

Sebelum membuat keputusan apapun, **bangun gambaran besar terlebih dahulu**:

### 3.1 — Siapa yang Mengendalikan Pasar?
- Apakah **buyer (bulls)** atau **seller (bears)** yang dominan?
- Apakah ada tanda-tanda **exhaustion** dari pihak yang dominan?
- Di mana **institusi besar** kemungkinan menaruh order mereka?

### 3.2 — Fase Pasar (Market Phase)
| Fase | Deskripsi |
|---|---|
| **TRENDING_UP** | Harga membuat Higher High / Higher Low secara konsisten |
| **TRENDING_DOWN** | Harga membuat Lower Low / Lower High secara konsisten |
| **RANGING** | Harga memantul di antara support dan resistance yang jelas |
| **CONSOLIDATION** | Harga bergerak sideways, energi sedang terakumulasi |
| **VOLATILE** | Pergerakan tidak terprediksi, spread melebar, risiko tinggi |
| **DISTRIBUTION** | Smart money sedang melepas posisi — waspadai reversal |
| **ACCUMULATION** | Smart money sedang mengumpulkan posisi — potensi breakout |

### 3.3 — Narasi Makro (jika tersedia)
- Risk-on vs risk-off di pasar global?
- **Emas berkorelasi terbalik dengan USD** — perhatikan kekuatan/kelemahan dolar
- Emas adalah **safe-haven asset** — ketidakpastian geopolitik/global = potensi demand naik
- Jika ada kalender ekonomi: NFP, FOMC, CPI, atau event besar lainnya → naikkan kewaspadaan, condongkan ke WAIT

---

## 4. KERANGKA ANALISIS — TOP-DOWN SEPERTI TRADER MANUSIA

Lakukan proses berpikir berjenjang ini secara internal sebelum menjawab. Hasilnya tercermin di field "reasoning".

### Langkah 1 — Baca "Big Picture" (H4 / H1)
- Apa arah tren dominan? Tentukan dari struktur **HH/HL** (uptrend), **LL/LH** (downtrend), atau struktur datar (ranging).
- Di mana posisi harga saat ini relatif terhadap zona **Support/Resistance atau Supply/Demand mayor**? Dekat zona penting, atau di "no man's land"?
- Apakah pasar trending kuat, konsolidasi, atau choppy?
- Ini adalah **"peta jalan"** Anda — jangan pernah abaikan konteks ini.

### Langkah 2 — Pahami "Mood" Pasar Saat Ini
- Bandingkan volatilitas saat ini dengan rata-rata menggunakan ATR. Kondisi "tenang", "normal", atau "ekstrem"?
- Jika sesi tersedia: **Asia** biasanya sempit/ranging; **London** sering memicu false break sebelum pergerakan nyata; **New York** cenderung trending dan news-driven.
- Apakah ada tanda **exhaustion** — momentum melemah (divergence RSI/MACD) padahal harga masih membuat high/low baru?

### Langkah 3 — Zoom In ke Timeframe Entry (M15 / M5)
- Apakah ada konfirmasi price action di timeframe kecil yang **searah dengan bias Layer 1**? (contoh: pullback ke demand zone, rejection candle di level kunci, break of structure)
- Apakah indikator **saling mendukung satu narasi**, atau justru bertentangan?
- Indikator bertentangan = sinyal kewaspadaan, **bukan alasan memaksakan keputusan**.

### Langkah 4 — Uji Konfluensi (Confluence Check)
- Apakah Langkah 1, 2, dan 3 membentuk **satu narasi yang koheren**?
- Contoh tidak koheren: H4 bullish, tapi harga baru saja rejection kuat di resistance utama dan momentum M15 melemah → ini alasan WAIT, bukan memaksa BUY.
- **Sinyal BUY/SELL**: Minimal 3 dari 5 indikator utama harus selaras
- **Sinyal WAIT**: Jika tidak ada konfluensi yang jelas

### Langkah 5 — Hitung Risiko Secara Realistis
- **Stop Loss**: tentukan berdasarkan struktur (di luar swing high/low terdekat), validasi dengan ATR — jangan terlalu sempit (tersapu noise) atau terlalu jauh (R:R tidak masuk akal)
- **Take Profit**: tentukan berdasarkan level S/R berikutnya yang realistis
- **R:R minimum 1:1.5** — jika di bawah itu, decision = WAIT meskipun arah terlihat benar

---

## 5. INTERPRETASI INDIKATOR

Gunakan semua indikator sebagai **bukti yang mendukung narasi**, bukan perintah berdiri sendiri:

| Indikator | Cara Baca |
|---|---|
| **EMA 20/50/200** | Tentukan tren dan dynamic support/resistance; perhatikan urutan bullish/bearish alignment |
| **RSI (14)** | Ukur kelelahan momentum. Overbought/oversold BUKAN sinyal langsung — hanya relevan jika ada konfirmasi price action |
| **MACD** | Konfirmasi perubahan momentum dan divergensi tersembunyi |
| **Bollinger Bands** | Squeeze = energi terakumulasi; expansion = breakout sedang terjadi |
| **ATR (14)** | Sesuaikan SL/TP berdasarkan volatilitas aktual, bukan nilai tetap |
| **Stochastic (14,3,3)** | Konfirmasi kondisi jenuh beli/jual pada timeframe rendah |
| **Ichimoku Cloud** | Tenkan/Kijun cross = sinyal momentum; posisi harga vs cloud = filter bias tren; cloud bullish/bearish = konteks jangka menengah |
| **Fibonacci Retracement** | Zona 38.2%–61.8% adalah golden zone untuk re-entry; perhatikan confluence Fibonacci + S/R struktur |
| **Williams %R (14)** | Konfirmasi kondisi jenuh beli (≥ -20) atau jenuh jual (≤ -80); berguna bersama Stochastic |
| **CCI (20)** | Nilai > +100 = overbought, < -100 = oversold; divergensi CCI dengan harga = sinyal reversal potensial |
| **Support/Resistance** | Level tertinggi dalam hierarki keputusan — hormati level ini |

---

## 6. KESADARAN & KEDEWASAAN (HUMAN-LIKE AWARENESS)

Anda **SADAR** bahwa tidak semua kondisi pasar layak ditradingkan. Berkata "saya tidak tahu, lebih baik tunggu" adalah tanda profesionalisme tertinggi.

Anda **WASPADA** terhadap jebakan psikologis umum:

- **FOMO** — mengejar harga yang sudah bergerak jauh dari zona entry ideal
- **Overconfidence** — terlalu percaya diri karena tren besar terlihat jelas, mengabaikan sinyal lawan di timeframe kecil
- **Confirmation Bias** — hanya fokus pada data yang mendukung satu opini, mengabaikan data yang bertentangan

Anda **ADAPTIF**: gunakan semua data yang relevan dari input, abaikan yang tidak relevan. Jangan menolak analisis hanya karena format data sedikit berbeda dari biasanya.

---

## 7. KALIBRASI CONFIDENCE SCORE

| Range | Kondisi |
|---|---|
| **0.80 – 1.00** | Semua timeframe & indikator selaras kuat, struktur jelas, R:R baik, volatilitas normal |
| **0.60 – 0.79** | Bias arah cukup jelas, ada 1–2 faktor kurang sempurna tapi setup masih layak |
| **< 0.60** | Ada konflik signifikan antar sinyal → decision **HARUS "WAIT"** |

---

## 8. ATURAN KERAS (TIDAK BOLEH DILANGGAR)

JANGAN berikan BUY/SELL jika confidence < 0.60
JANGAN berikan BUY/SELL jika confluence_score < 5
JANGAN berikan BUY/SELL jika R:R < 1.5
JANGAN abaikan konteks timeframe yang lebih besar
JANGAN memberi sinyal hanya demi "terlihat aktif"
SELALU sertakan level invalidasi
SELALU jelaskan apa yang akan membuat analisis ini salah
WAIT adalah keputusan profesional — bukan kelemahan

---

## 9. FORMAT OUTPUT (JSON WAJIB)

Respons HANYA dalam format JSON valid berikut — tidak ada teks di luar JSON, tidak ada markdown code block, tidak ada pembuka/penutup:

{"decision":"BUY|SELL|WAIT","confidence":0.0,"entry_price":null,"take_profit":null,"stop_loss":null,"risk_reward_ratio":null,"market_phase":"TRENDING_UP|TRENDING_DOWN|RANGING|CONSOLIDATION|VOLATILE|DISTRIBUTION|ACCUMULATION","timeframe_bias":{"H4":"BULLISH|BEARISH|NEUTRAL","H1":"BULLISH|BEARISH|NEUTRAL","M15":"BULLISH|BEARISH|NEUTRAL"},"confluence_score":0,"key_levels":{"nearest_resistance":null,"nearest_support":null},"market_context":"Deskripsi singkat kondisi pasar saat ini: fase, siapa yang dominan, level kritis","reasoning":"Penjelasan naratif lengkap dalam Bahasa Indonesia yang mencerminkan proses berpikir Langkah 1-5: kondisi big picture, mood pasar, konfirmasi entry, hasil confluence check, dasar penentuan TP/SL, dan faktor risiko tambahan jika ada.","invalidation":"Kondisi atau level spesifik yang jika tercapai berarti analisis ini SALAH dan sinyal harus segera dibatalkan"}

Catatan Output:
- Jika "decision" adalah "WAIT", maka entry_price, take_profit, stop_loss, dan risk_reward_ratio WAJIB null
- TP dan SL harus realistis berdasarkan ATR dan level S/R yang terlihat dari data — bukan angka bulat sembarangan
- confluence_score adalah integer 0-10 yang merepresentasikan berapa banyak faktor/indikator yang selaras
- Gunakan Bahasa Indonesia yang profesional, jelas, dan mudah dimengerti di semua field teks`;

// ─── AI Signal Type ────────────────────────────────────────────────────────────

export interface AISignal {
  decision: "BUY" | "SELL" | "WAIT";
  confidence: number;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  risk_reward_ratio: number | null;
  market_phase: string;
  timeframe_bias: {
    H4: "BULLISH" | "BEARISH" | "NEUTRAL";
    H1: "BULLISH" | "BEARISH" | "NEUTRAL";
    M15: "BULLISH" | "BEARISH" | "NEUTRAL";
  };
  confluence_score: number;
  key_levels: {
    nearest_resistance: number | null;
    nearest_support: number | null;
  };
  market_context: string;
  reasoning: string;
  invalidation: string;
}

// ─── Memory System ─────────────────────────────────────────────────────────────

interface MemoryEntry {
  timestamp: string;         // ISO
  timeWib: string;           // human-readable WIB
  decision: string;
  confidence: number;
  price: number;
  market_phase: string;
  bias: { H4: string; H1: string; M15: string };
  confluence_score: number;
  market_context: string;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  result?: "WIN" | "LOSS" | "ACTIVE" | "EXPIRED";
  exit_price?: number;
  exit_time?: string;
}

interface SessionStats {
  wins: number;
  losses: number;
  totalSignals: number;       // BUY/SELL only
  totalAnalyses: number;
  waitCount: number;
  lastMarketPhases: string[]; // last 5 phases
  lastBiasH4: string[];       // last 5 H4 bias readings
}

const MAX_MEMORY = 20;
const memory: MemoryEntry[] = [];
const sessionStats: SessionStats = {
  wins: 0,
  losses: 0,
  totalSignals: 0,
  totalAnalyses: 0,
  waitCount: 0,
  lastMarketPhases: [],
  lastBiasH4: [],
};

// Load persisted memory from disk on startup
(function initPersistedMemory() {
  const persisted = loadPersistedMemory();
  if (persisted && Array.isArray(persisted.memory)) {
    memory.push(...(persisted.memory as MemoryEntry[]).slice(0, MAX_MEMORY));
    const s = persisted.sessionStats as Partial<SessionStats>;
    if (s) {
      if (typeof s.wins === "number") sessionStats.wins = s.wins;
      if (typeof s.losses === "number") sessionStats.losses = s.losses;
      if (typeof s.totalSignals === "number") sessionStats.totalSignals = s.totalSignals;
      if (typeof s.totalAnalyses === "number") sessionStats.totalAnalyses = s.totalAnalyses;
      if (typeof s.waitCount === "number") sessionStats.waitCount = s.waitCount;
      if (Array.isArray(s.lastMarketPhases)) sessionStats.lastMarketPhases = s.lastMarketPhases;
      if (Array.isArray(s.lastBiasH4)) sessionStats.lastBiasH4 = s.lastBiasH4;
    }
  }
})();

/** Called after every analysis cycle */
export function recordAnalysis(signal: AISignal, price: number, timeWib: string): void {
  sessionStats.totalAnalyses++;

  if (signal.decision === "WAIT") {
    sessionStats.waitCount++;
  } else {
    sessionStats.totalSignals++;
  }

  // Track rolling phase & bias
  sessionStats.lastMarketPhases.push(signal.market_phase);
  if (sessionStats.lastMarketPhases.length > 5) sessionStats.lastMarketPhases.shift();

  sessionStats.lastBiasH4.push(signal.timeframe_bias.H4);
  if (sessionStats.lastBiasH4.length > 5) sessionStats.lastBiasH4.shift();

  const entry: MemoryEntry = {
    timestamp: new Date().toISOString(),
    timeWib,
    decision: signal.decision,
    confidence: signal.confidence,
    price,
    market_phase: signal.market_phase,
    bias: { ...signal.timeframe_bias },
    confluence_score: signal.confluence_score,
    market_context: signal.market_context,
    entry_price: signal.entry_price,
    take_profit: signal.take_profit,
    stop_loss: signal.stop_loss,
    result: signal.decision !== "WAIT" ? "ACTIVE" : undefined,
  };

  memory.unshift(entry);
  if (memory.length > MAX_MEMORY) memory.splice(MAX_MEMORY);
  saveMemoryToDisk(memory, sessionStats);
}

/** Called when TP/SL is hit */
export function recordSignalResult(result: "WIN" | "LOSS", exitPrice: number): void {
  if (result === "WIN") sessionStats.wins++;
  else sessionStats.losses++;

  // Mark the most recent non-WAIT signal as resolved
  const active = memory.find(
    (m) => m.decision !== "WAIT" && m.result === "ACTIVE"
  );
  if (active) {
    active.result = result;
    active.exit_price = exitPrice;
    active.exit_time = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  saveMemoryToDisk(memory, sessionStats);
}

/** Build natural-language memory context injected into each AI call */
function buildMemoryContext(): string {
  if (memory.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 🧠 MEMORI ATLAS — Konteks & Ingatan Siklus Sebelumnya\n");
  lines.push("PENTING: Gunakan konteks di bawah ini untuk membuat analisis yang KONSISTEN dan EVOLUSIONER, bukan analisis yang mulai dari nol. Perhatikan apakah karakter pasar berubah, apakah bias sebelumnya terbukti benar, dan evaluasi keputusan lalu.\n");

  // --- Session stats
  const winRate = (sessionStats.wins + sessionStats.losses) > 0
    ? Math.round(sessionStats.wins / (sessionStats.wins + sessionStats.losses) * 100)
    : null;

  lines.push("### 📊 Statistik Sesi Ini:");
  lines.push(`- Total analisis: ${sessionStats.totalAnalyses} | Sinyal BUY/SELL: ${sessionStats.totalSignals} | WAIT: ${sessionStats.waitCount}`);
  if (winRate !== null) {
    lines.push(`- Hasil sinyal: ${sessionStats.wins} WIN / ${sessionStats.losses} LOSS → Win Rate: **${winRate}%**`);
  }
  if (sessionStats.lastMarketPhases.length > 0) {
    lines.push(`- Fase pasar 5 siklus terakhir: ${sessionStats.lastMarketPhases.join(" → ")}`);
  }
  if (sessionStats.lastBiasH4.length > 0) {
    lines.push(`- Bias H4 dominan: ${sessionStats.lastBiasH4.join(" → ")}`);
  }

  // --- Recent analyses
  lines.push("\n### 🕐 Riwayat 10 Analisis Terakhir:");
  const recent = memory.slice(0, 10);
  recent.forEach((m, i) => {
    const resultTag = m.result
      ? m.result === "WIN" ? " → ✅ WIN" + (m.exit_price ? ` (exit $${m.exit_price.toFixed(2)})` : "")
      : m.result === "LOSS" ? " → ❌ LOSS" + (m.exit_price ? ` (exit $${m.exit_price.toFixed(2)})` : "")
      : m.result === "ACTIVE" ? " → ⏳ AKTIF (menunggu TP/SL)"
      : ""
      : "";
    const biasStr = `H4:${m.bias.H4} H1:${m.bias.H1} M15:${m.bias.M15}`;
    const confPct = Math.round(m.confidence * 100);
    lines.push(
      `${i + 1}. [${m.timeWib}] **${m.decision}** | $${m.price.toFixed(2)} | conf:${confPct}% | ${m.market_phase} | bias:${biasStr}${resultTag}`
    );
    if (m.decision !== "WAIT") {
      lines.push(
        `   Entry:$${m.entry_price?.toFixed(2) ?? "-"} TP:$${m.take_profit?.toFixed(2) ?? "-"} SL:$${m.stop_loss?.toFixed(2) ?? "-"}`
      );
    }
    lines.push(`   "${m.market_context}"`);
  });

  // --- Reflection prompts
  lines.push("\n### 🔎 Instruksi Refleksi Diri:");
  lines.push("Sebelum membuat keputusan baru, jawab pertanyaan berikut secara internal (tercermin dalam 'reasoning'):");
  lines.push("1. **Konsistensi**: Apakah kondisi pasar saat ini berubah signifikan dari siklus sebelumnya? Jika tidak — pertahankan narasi. Jika ya — jelaskan apa yang berubah.");
  lines.push("2. **Evaluasi Sinyal Lalu**: Jika ada sinyal AKTIF — harga sudah bergerak ke mana? Mendekati TP atau SL?");
  lines.push("3. **Pembelajaran LOSS**: Jika sinyal terakhir LOSS — identifikasi apa yang keliru. Apakah kondisi saat ini sudah lebih baik, atau masih ada kelemahan yang sama?");
  lines.push("4. **Bias Drift**: Apakah bias H4 berubah arah dari analisis ke analisis? Perubahan bias yang konsisten menandakan perubahan tren yang sesungguhnya.");
  lines.push("5. **Over-Trading Guard**: Jika sudah ≥3 WAIT berturut-turut, pertimbangkan — apakah ini memang kondisi sulit, atau ada setup yang terlewat?");

  return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTradingSession(): string {
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 22 || utcHour < 7) return "Sydney/Tokyo (Asia) — 05:00–14:00 WIB";
  if (utcHour >= 7 && utcHour < 12) return "London — 14:00–19:00 WIB";
  if (utcHour >= 12 && utcHour < 16) return "London + New York Overlap — 19:00–23:00 WIB";
  if (utcHour >= 16 && utcHour < 21) return "New York — 23:00–04:00 WIB";
  return "Off-hours / transisi sesi";
}

// ─── Main Analysis Function ────────────────────────────────────────────────────

export async function analyzeMarket(timeframes: TimeframeData[], currentPrice: number): Promise<AISignal> {
  const now = new Date();
  const wibTime = now.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const sensoryData = {
    symbol: "XAUUSD",
    current_price: currentPrice,
    analysis_time: now.toISOString(),
    analysis_time_wib: wibTime,
    trading_session: getTradingSession(),
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
          ? { k: tf.stochastic.k.toFixed(2), d: tf.stochastic.d.toFixed(2) }
          : null,
        stochastic_condition: tf.stoch_condition,
        ichimoku: tf.ichimoku
          ? {
              tenkan: tf.ichimoku.tenkan?.toFixed(2),
              kijun: tf.ichimoku.kijun?.toFixed(2),
              senkou_a: tf.ichimoku.senkou_a?.toFixed(2),
              senkou_b: tf.ichimoku.senkou_b?.toFixed(2),
              cloud_color: tf.ichimoku.cloud_color,
              price_vs_cloud: tf.ichimoku.price_vs_cloud,
              tenkan_kijun_cross: tf.ichimoku.tenkan_kijun_cross,
            }
          : null,
        fibonacci: tf.fibonacci
          ? {
              swing_high: tf.fibonacci.swing_high.toFixed(2),
              swing_low: tf.fibonacci.swing_low.toFixed(2),
              trend: tf.fibonacci.trend,
              level_236: tf.fibonacci.level_236.toFixed(2),
              level_382: tf.fibonacci.level_382.toFixed(2),
              level_500: tf.fibonacci.level_500.toFixed(2),
              level_618: tf.fibonacci.level_618.toFixed(2),
              level_786: tf.fibonacci.level_786.toFixed(2),
              nearest_level: tf.fibonacci.nearest_level,
              price_zone: tf.fibonacci.price_zone,
            }
          : null,
        williams_r: tf.williams_r?.toFixed(2),
        williams_r_condition: tf.williams_r_condition,
        cci_20: tf.cci_20?.toFixed(2),
        cci_condition: tf.cci_condition,
      },
      price_action: {
        candlestick_patterns: tf.patterns.map((p) => `${p.name} (${p.type})`),
        key_support_levels: tf.support_levels.map((s) => s.toFixed(2)),
        key_resistance_levels: tf.resistance_levels.map((r) => r.toFixed(2)),
      },
    })),
  };

  // Fetch news calendar (non-blocking — fallback to empty if fails)
  const calendarCtx = await getCalendarContext().catch(() => null);
  const calendarSection = calendarCtx ? formatCalendarForAI(calendarCtx) : "";

  // Build the full user message: memory + news + market data
  const memoryContext = buildMemoryContext();
  const marketDataSection = `## 📡 DATA PASAR REAL-TIME SAAT INI\n\n${JSON.stringify(sensoryData, null, 2)}`;

  const parts: string[] = [];
  if (memoryContext) parts.push(memoryContext);
  if (calendarSection) parts.push(calendarSection);
  parts.push(marketDataSection);
  parts.push("---\n\nBerdasarkan semua konteks di atas (memori, kalender ekonomi, dan data pasar), berikan analisis dan keputusan trading Atlas sekarang:");

  const userMessage = parts.join("\n\n---\n\n");

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
    parsed.risk_reward_ratio = null;
  }

  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
  parsed.confluence_score = Math.max(0, Math.min(10, parsed.confluence_score ?? 0));
  parsed.timeframe_bias ??= { H4: "NEUTRAL", H1: "NEUTRAL", M15: "NEUTRAL" };
  parsed.key_levels ??= { nearest_resistance: null, nearest_support: null };
  parsed.market_phase ??= "RANGING";
  parsed.invalidation ??= "-";

  // Record to memory AFTER successful parse
  recordAnalysis(parsed, currentPrice, wibTime);

  logger.info(
    { decision: parsed.decision, confidence: parsed.confidence, memoryEntries: memory.length },
    "AI analysis complete (with memory context)"
  );

  return parsed;
}

export function getMemorySnapshot() {
  return {
    entries: memory.slice(0, 10),
    stats: { ...sessionStats },
  };
}
