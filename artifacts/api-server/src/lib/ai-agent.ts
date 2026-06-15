import type { TimeframeData } from "./indicators.js";
import type { USDProxy } from "./deriv-client.js";
import { logger } from "./logger.js";
import { getCalendarContext, formatCalendarForAI } from "./news-calendar.js";
import { loadPersistedMemory, saveMemoryToDisk } from "./persistent-memory.js";
import { getLongTermNotes, applyLTMOps, type LTMOp } from "./long-term-memory.js";

const AI_API_URL = process.env.AI_API_URL ?? "https://qwn-api--miok1qpgd.replit.app/v1/chat/completions";
const AI_API_KEY = process.env.AI_API_KEY ?? "";
const AI_MODEL = process.env.AI_MODEL ?? "qwen3.7-max";

if (!AI_API_KEY) {
  throw new Error(
    "AI_API_KEY environment variable is not set. Set it in Replit Secrets before starting the bot."
  );
}

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

### 3.3 — Konteks USD & Narasi Makro (Data Tersedia)
- **Data "usd_context" SELALU tersedia** — berisi trend EURUSD H1 sebagai proxy kekuatan dolar:
  - USD_WEAK (EURUSD naik) → Tekanan **BULLISH** pada emas — dolar melemah mendorong harga emas naik
  - USD_STRONG (EURUSD turun) → Tekanan **BEARISH** pada emas — dolar menguat menekan harga emas
  - USD_NEUTRAL → Dampak dolar minimal — fokus pada struktur teknikal emas itu sendiri
- Konfirmasi USD context dengan bias H4 emas: jika keduanya alignment (contoh: USD_WEAK + H4 BULLISH), konfluensi lebih kuat
- Emas adalah **safe-haven asset** — ketidakpastian geopolitik/global = potensi demand naik
- Jika ada kalender ekonomi: NFP, FOMC, CPI, atau event besar → naikkan kewaspadaan, condongkan ke WAIT
- Jika field "market_close_warning" terisi → **sangat disarankan WAIT** atau kurangi risk secara signifikan (risiko gap weekend)

---

## 4. KERANGKA ANALISIS — TOP-DOWN SEPERTI TRADER MANUSIA

Lakukan proses berpikir berjenjang ini secara internal sebelum menjawab. Hasilnya tercermin di field "reasoning".

### Langkah 1 — Baca "Big Picture" (D1 → H4 → H1)
- **Mulai dari D1** (50 candle ≈ 2 bulan): tentukan tren jangka panjang, identifikasi level psikologis besar (monthly high/low, zona konsolidasi mayor, support/resistance bersejarah). Ini "peta jalan" terluar yang tidak boleh diabaikan.
- Kemudian konfirmasi di H4 dan H1: apakah tren D1 masih konsisten? Di mana posisi harga relatif terhadap struktur D1? Apakah harga mendekati zona kunci jangka panjang?
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
| **ATR Percentile** | ATR saat ini relatif rata-rata 20 periode: <80% = tenang/squeeze (potensi breakout); 80–120% = normal; >120% = volatilitas tinggi → dukung label VOLATILE/RANGING; >150% = sangat volatil, perlebar SL |
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

{"decision":"BUY|SELL|WAIT","confidence":0.0,"entry_price":null,"take_profit":null,"stop_loss":null,"risk_reward_ratio":null,"market_phase":"TRENDING_UP|TRENDING_DOWN|RANGING|CONSOLIDATION|VOLATILE|DISTRIBUTION|ACCUMULATION","timeframe_bias":{"H4":"BULLISH|BEARISH|NEUTRAL","H1":"BULLISH|BEARISH|NEUTRAL","M15":"BULLISH|BEARISH|NEUTRAL"},"confluence_score":0,"key_levels":{"nearest_resistance":null,"nearest_support":null},"market_context":"Deskripsi singkat kondisi pasar saat ini: fase, siapa yang dominan, level kritis","reasoning":"Penjelasan naratif lengkap dalam Bahasa Indonesia yang mencerminkan proses berpikir Langkah 1-5: mulai dari D1 big picture, konfirmasi H4/H1, mood pasar, konfirmasi entry M15/M5, hasil confluence check, dasar penentuan TP/SL, dan faktor risiko tambahan jika ada.","invalidation":"Kondisi atau level spesifik yang jika tercapai berarti analisis ini SALAH dan sinyal harus segera dibatalkan","bull_case":"3 argumen teknikal terkuat mengapa harga NAIK saat ini — spesifik dan berbasis data yang tersedia (level, indikator, struktur)","bear_case":"3 argumen teknikal terkuat mengapa harga TURUN saat ini — spesifik dan berbasis data yang tersedia (level, indikator, struktur)","what_would_change_my_mind":"Kondisi teknikal atau level harga spesifik yang jika terjadi akan membalikkan keputusan ini sepenuhnya","lesson":"1-2 kalimat insight kualitatif dari kondisi pasar saat ini yang berguna untuk diingat di siklus berikutnya — berisi pola atau nuansa yang tidak tertangkap angka (contoh: 'resistance H1 $X sudah diuji 3x minggu ini, setiap breakout gagal — level ini sangat kuat')","long_term_memory_ops":null}

Catatan Output:
- Jika "decision" adalah "WAIT", maka entry_price, take_profit, stop_loss, dan risk_reward_ratio WAJIB null
- TP dan SL harus realistis berdasarkan ATR dan level S/R yang terlihat dari data — bukan angka bulat sembarangan
- confluence_score adalah integer 0-10 yang merepresentasikan berapa banyak faktor/indikator yang selaras
- bull_case dan bear_case WAJIB diisi — bahkan saat WAIT, menimbang kedua sisi adalah inti dari analisis yang jujur
- lesson WAJIB diisi — isi dengan insight yang tidak bisa diwakili angka; jika tidak ada yang istimewa, tuliskan observasi pasar yang paling relevan saat ini
- Gunakan Bahasa Indonesia yang profesional, jelas, dan mudah dimengerti di semua field teks

---

## 10. MEMORI JANGKA PANJANG (LONG-TERM NOTES)

Anda memiliki dua lapis memori:
1. **Memori kerja (rolling 20)** — riwayat siklus otomatis, terganti seiring waktu
2. **Catatan permanen (long_term_notes)** — insight yang Anda sendiri putuskan untuk disimpan karena nilainya bertahan lama

Field **"long_term_memory_ops"** memungkinkan Anda mengelola catatan permanen ini. Isi dengan array operasi (atau null jika tidak ada perubahan):

- **ADD** — tambah catatan baru: \`{"op":"ADD","content":"teks insight"}\`
- **UPDATE** — perbarui catatan yang masih relevan tapi perlu revisi: \`{"op":"UPDATE","id":"<id>","content":"teks baru"}\`
- **DELETE** — hapus catatan yang sudah tidak berlaku: \`{"op":"DELETE","id":"<id>"}\`

**Kapan ADD?** Ketika Anda menemukan pola yang kemungkinan berlaku beberapa hari ke depan — bukan hanya siklus ini. Contoh:
- Level harga yang sudah diuji berulang kali dan terbukti kuat
- Karakteristik pasar yang tidak biasa (volatilitas ekstrem, divergensi tidak lazim)
- Pola bias yang konsisten dalam sesi tertentu

**Kapan DELETE/UPDATE?** Saat Anda melihat catatan yang sudah tidak relevan di bagian "Catatan Permanen" prompt — misalnya harga sudah jauh melewati level yang disebutkan, atau kondisi yang dicatat sudah berubah total.

**Kapasitas: maks 10 catatan.** Jika sudah penuh, hapus yang paling tidak relevan sebelum menambah yang baru.

Jika tidak ada perubahan yang diperlukan, set "long_term_memory_ops" ke null.`;

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
  bull_case: string | string[];
  bear_case: string | string[];
  what_would_change_my_mind: string | string[];
  lesson: string;
  long_term_memory_ops?: LTMOp[] | null;
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
  lesson?: string;
  invalidation?: string;
  what_would_change_my_mind?: string | string[];
  result?: "WIN" | "LOSS" | "ACTIVE" | "EXPIRED";
  exit_price?: number;
  exit_time?: string;
}

interface ConfidenceBandStats {
  wins: number;
  losses: number;
}

interface SessionStats {
  wins: number;
  losses: number;
  totalSignals: number;       // BUY/SELL only
  totalAnalyses: number;
  waitCount: number;
  lastMarketPhases: string[]; // last 5 phases
  lastBiasH4: string[];       // last 5 H4 bias readings
  // Metacognition — calibration by confidence band
  confidenceBands: {
    high: ConfidenceBandStats;    // confidence >= 0.80
    medium: ConfidenceBandStats;  // 0.60 <= confidence < 0.80
  };
  // Metacognition — performance per market phase
  phasePerformance: Record<string, { wins: number; losses: number }>;
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
  confidenceBands: {
    high: { wins: 0, losses: 0 },
    medium: { wins: 0, losses: 0 },
  },
  phasePerformance: {},
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
      if (s.confidenceBands) sessionStats.confidenceBands = s.confidenceBands;
      if (s.phasePerformance && typeof s.phasePerformance === "object") {
        sessionStats.phasePerformance = s.phasePerformance;
      }
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

  if (signal.lesson && signal.lesson !== "-") entry.lesson = signal.lesson;
  if (signal.invalidation && signal.invalidation !== "-") entry.invalidation = signal.invalidation;
  if (signal.what_would_change_my_mind && signal.what_would_change_my_mind !== "-") {
    entry.what_would_change_my_mind = signal.what_would_change_my_mind;
  }

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

    // ─── Metacognition: track by confidence band ─────────────────────────────
    const isWin = result === "WIN";
    const band = active.confidence >= 0.80 ? "high" : "medium";
    if (isWin) sessionStats.confidenceBands[band].wins++;
    else sessionStats.confidenceBands[band].losses++;

    // ─── Metacognition: track by market phase ────────────────────────────────
    const phase = active.market_phase;
    if (phase) {
      const pp = sessionStats.phasePerformance;
      if (!pp[phase]) pp[phase] = { wins: 0, losses: 0 };
      if (isWin) pp[phase].wins++;
      else pp[phase].losses++;
    }
  }
  saveMemoryToDisk(memory, sessionStats);
}

/** Build natural-language memory context injected into each AI call */
function buildMemoryContext(): string {
  const ltNotes = getLongTermNotes();
  const hasMemory = memory.length > 0;
  if (!hasMemory && ltNotes.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 🧠 MEMORI ATLAS — Konteks & Ingatan Siklus Sebelumnya\n");
  lines.push("PENTING: Gunakan konteks di bawah ini untuk membuat analisis yang KONSISTEN dan EVOLUSIONER, bukan analisis yang mulai dari nol. Perhatikan apakah karakter pasar berubah, apakah bias sebelumnya terbukti benar, dan evaluasi keputusan lalu.\n");

  // ── Long-term notes (injected FIRST — highest priority context) ────────────
  if (ltNotes.length > 0) {
    lines.push("### 📌 Catatan Permanen (Long-Term Memory):");
    lines.push("Insight di bawah ini Anda simpan sendiri karena dianggap relevan jangka panjang. Tinjau apakah masih berlaku — hapus yang sudah tidak relevan, perbarui yang perlu revisi.");
    ltNotes.forEach((n) => {
      const age = Math.round((Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60));
      lines.push(`  [${n.id.slice(0, 8)}] (${age}j lalu) ${n.content}`);
    });
    lines.push("");
  }

  if (!hasMemory) return lines.join("\n");

  // ── Session stats ──────────────────────────────────────────────────────────
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

  // ── Self-calibration (metacognition) ──────────────────────────────────────
  const hB = sessionStats.confidenceBands.high;
  const mB = sessionStats.confidenceBands.medium;
  const hTotal = hB.wins + hB.losses;
  const mTotal = mB.wins + mB.losses;

  if (hTotal > 0 || mTotal > 0) {
    lines.push("\n### 🔬 Kalibrasi Diri (Metacognition):");
    lines.push("Gunakan data ini untuk mengevaluasi seberapa terkalibrasi confidence score Anda:");

    if (hTotal > 0) {
      const hRate = Math.round(hB.wins / hTotal * 100);
      const calibNote = hRate >= 70 ? "✅ terkalibrasi baik" : hRate >= 50 ? "⚠️ cukup terkalibrasi" : "🔴 OVERCONFIDENT — confidence tinggi tapi sering salah";
      lines.push(`  • Confidence ≥80%: ${hB.wins}W / ${hB.losses}L → Win Rate **${hRate}%** — ${calibNote}`);
    } else {
      lines.push("  • Confidence ≥80%: belum ada data (belum ada sinyal closed di band ini)");
    }

    if (mTotal > 0) {
      const mRate = Math.round(mB.wins / mTotal * 100);
      const calibNote = mRate >= 60 ? "✅ terkalibrasi baik" : mRate >= 40 ? "⚠️ cukup terkalibrasi" : "🔴 akurasi rendah di band ini";
      lines.push(`  • Confidence 60–79%: ${mB.wins}W / ${mB.losses}L → Win Rate **${mRate}%** — ${calibNote}`);
    } else {
      lines.push("  • Confidence 60–79%: belum ada data");
    }

    // Phase performance — show top 3 most traded phases
    const phases = Object.entries(sessionStats.phasePerformance)
      .filter(([, v]) => v.wins + v.losses > 0)
      .sort(([, a], [, b]) => (b.wins + b.losses) - (a.wins + a.losses))
      .slice(0, 3);

    if (phases.length > 0) {
      lines.push("  • Performa per fase pasar:");
      phases.forEach(([phase, { wins, losses }]) => {
        const total = wins + losses;
        const rate = Math.round(wins / total * 100);
        const emoji = rate >= 60 ? "✅" : rate >= 40 ? "⚠️" : "🔴";
        lines.push(`    ${emoji} ${phase}: ${wins}W/${losses}L (${rate}%)`);
      });
    }

    lines.push("  → Perhatikan: jika win rate di band confidence tinggi LEBIH RENDAH dari band medium, Anda mungkin overconfident saat market dalam kondisi tertentu.");
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
    if (m.lesson) {
      lines.push(`   📝 Lesson: "${m.lesson}"`);
    }
    if (m.invalidation) {
      lines.push(`   ⚠️ Invalidasi dulu: "${m.invalidation}"`);
    }
    if (m.what_would_change_my_mind) {
      const w = Array.isArray(m.what_would_change_my_mind)
        ? m.what_would_change_my_mind[0]
        : m.what_would_change_my_mind;
      lines.push(`   🔄 Pemicu arah dulu: "${w}"`);
    }
  });

  // --- Reflection prompts
  lines.push("\n### 🔎 Instruksi Refleksi Diri:");
  lines.push("Sebelum membuat keputusan baru, jawab pertanyaan berikut secara internal (tercermin dalam 'reasoning'):");
  lines.push("1. **Konsistensi**: Apakah kondisi pasar saat ini berubah signifikan dari siklus sebelumnya? Jika tidak — pertahankan narasi. Jika ya — jelaskan apa yang berubah.");
  lines.push("2. **Evaluasi Sinyal Lalu**: Jika ada sinyal AKTIF — harga sudah bergerak ke mana? Mendekati TP atau SL?");
  lines.push("3. **Pembelajaran LOSS**: Jika sinyal terakhir LOSS — identifikasi apa yang keliru. Apakah kondisi saat ini sudah lebih baik, atau masih ada kelemahan yang sama?");
  lines.push("4. **Bias Drift**: Apakah bias H4 berubah arah dari analisis ke analisis? Perubahan bias yang konsisten menandakan perubahan tren yang sesungguhnya.");
  lines.push("5. **Over-Trading Guard**: Jika sudah ≥3 WAIT berturut-turut, pertimbangkan — apakah ini memang kondisi sulit, atau ada setup yang terlewat?");
  lines.push("6. **Validasi Invalidasi**: Tinjau field `invalidation` dan `what_would_change_my_mind` dari siklus terakhir — apakah kondisi itu sudah terpenuhi sekarang? Jika ya, bias lama mungkin sudah tidak valid meski sinyal belum closed.");

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

// ─── Signal Sanity Validation ─────────────────────────────────────────────────

function validateSignal(
  signal: Partial<AISignal>,
  currentPrice: number
): { valid: boolean; reason?: string } {
  if (signal.decision === "WAIT") return { valid: true };

  const { entry_price: entry, take_profit: tp, stop_loss: sl, decision } = signal;

  if (entry == null || tp == null || sl == null) {
    return { valid: false, reason: `${decision} tanpa entry/TP/SL lengkap` };
  }

  if (decision === "BUY") {
    if (sl >= entry) {
      return { valid: false, reason: `BUY geometry rusak: SL ($${sl.toFixed(2)}) ≥ entry ($${entry.toFixed(2)}) — seharusnya SL < entry` };
    }
    if (tp <= entry) {
      return { valid: false, reason: `BUY geometry rusak: TP ($${tp.toFixed(2)}) ≤ entry ($${entry.toFixed(2)}) — seharusnya TP > entry` };
    }
  } else if (decision === "SELL") {
    if (sl <= entry) {
      return { valid: false, reason: `SELL geometry rusak: SL ($${sl.toFixed(2)}) ≤ entry ($${entry.toFixed(2)}) — seharusnya SL > entry` };
    }
    if (tp >= entry) {
      return { valid: false, reason: `SELL geometry rusak: TP ($${tp.toFixed(2)}) ≥ entry ($${entry.toFixed(2)}) — seharusnya TP < entry` };
    }
  }

  const maxDeviation = currentPrice * 0.015;
  if (Math.abs(entry - currentPrice) > maxDeviation) {
    return {
      valid: false,
      reason: `Entry ($${entry.toFixed(2)}) terlalu jauh dari harga saat ini ($${currentPrice.toFixed(2)}) — deviasi ${Math.abs(entry - currentPrice).toFixed(2)} > max ${maxDeviation.toFixed(2)} (1.5%)`,
    };
  }

  return { valid: true };
}

// ─── Market Close Warning (Weekend Gap Risk) ──────────────────────────────────

function getMarketCloseWarning(): string | null {
  const now = new Date();
  const dayUTC = now.getUTCDay(); // 0=Sun 1=Mon ... 5=Fri 6=Sat
  if (dayUTC !== 5) return null;

  const closeTotalMin = 20 * 60 + 55; // Deriv XAUUSD closes ~20:55 UTC Friday
  const nowTotalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minutesLeft = closeTotalMin - nowTotalMin;
  if (minutesLeft <= 0) return null;

  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;
  const timeLabel = h > 0 ? `${h} jam ${m} menit` : `${m} menit`;

  if (minutesLeft <= 120) {
    return `🚨 PERINGATAN KRITIS: Market XAUUSD tutup dalam ${timeLabel} (Jumat 20:55 UTC). SANGAT DISARANKAN WAIT — risiko gap weekend tinggi, spread melebar, likuiditas menipis.`;
  }
  if (minutesLeft <= 240) {
    return `⚡ PERHATIAN: Market XAUUSD tutup dalam ${timeLabel} (Jumat 20:55 UTC). Pertimbangkan risiko gap weekend jika membuka posisi baru.`;
  }
  return null;
}

// ─── On-Demand Signal Type ─────────────────────────────────────────────────────

export interface OnDemandSignal extends AISignal {
  setup_type: "IMMEDIATE_ENTRY" | "PENDING_SETUP" | "NO_SETUP";
  pending_order_type: "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP" | null;
  pending_trigger: string | null;
  strategy_label: string;
}

// ─── Chat Addendum Prompt ──────────────────────────────────────────────────────

function buildChatAddendum(userQuery: string): string {
  return `## 🗣️ MODE ON-DEMAND — PERMINTAAN LANGSUNG DARI USER

Ini BUKAN siklus otomatis 5 menit. User baru saja meminta analisis secara
aktif melalui Telegram dengan permintaan berikut (tulis bebas — interpretasikan
sendiri gaya/strategi yang dimaksud, lalu rancang sendiri pendekatan analisis
yang sesuai: timeframe mana yang paling relevan dijadikan fokus, seberapa
ketat SL/TP, dst. JANGAN mengikuti template atau aturan kaku berdasarkan
kata kunci — gunakan penalaran Anda sendiri seperti trader manusia yang
ditanya langsung oleh kliennya):

> "${userQuery}"

### Perbedaan dari Mode Otomatis

Pada siklus otomatis, jika tidak ada konfluensi kuat, jawaban "WAIT" tanpa
arah lebih lanjut sudah cukup. Tapi sekarang user secara AKTIF bertanya dan
menunggu jawaban — seorang trader profesional yang ditanya langsung tidak
akan menjawab "saya tidak tahu" begitu saja kalau dia punya pandangan apapun
soal arah pasar. Karena itu, JANGAN berhenti di "WAIT" kosong. Pilih SALAH
SATU dari tiga jenis respons berikut untuk field baru "setup_type":

1. **IMMEDIATE_ENTRY**
   Kondisi SEKARANG sudah layak entry — sama seperti BUY/SELL pada mode
   otomatis. ATURAN KERAS #8 (confidence ≥ 0.60, confluence_score ≥ 5,
   R:R ≥ 1.5) TETAP BERLAKU PENUH untuk pilihan ini.

2. **PENDING_SETUP**
   Belum layak entry SEKARANG, tapi Anda punya pandangan jelas tentang LEVEL
   HARGA SPESIFIK di mana setup ini akan menjadi valid. Field "entry_price"
   diisi LEVEL PENDING tersebut (boleh jauh dari harga sekarang — TIDAK
   terikat batas deviasi 1.5%). TP dan SL dihitung relatif terhadap level
   pending ini.

3. **NO_SETUP**
   HANYA jika pasar benar-benar tidak terbaca sama sekali — sangat choppy,
   tanpa struktur, tanpa bias yang masuk akal. Ini harus jarang terjadi.

### Field Tambahan WAJIB di Output JSON

- **"setup_type"**: "IMMEDIATE_ENTRY" | "PENDING_SETUP" | "NO_SETUP"
- **"pending_order_type"**: "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP" | null
  (isi hanya jika PENDING_SETUP, sesuai posisi entry vs harga sekarang)
- **"pending_trigger"**: string | null
  (kondisi konfirmasi spesifik yang masih harus terjadi sebelum entry valid)
- **"strategy_label"**: string
  (satu kalimat gaya analisis yang Anda pilih, misal: "Scalping M5/M15, target 10-20 pips, SL ketat")

Untuk IMMEDIATE_ENTRY dan PENDING_SETUP, "decision" tetap "BUY" atau "SELL".
Untuk NO_SETUP, "decision" = "WAIT" dan semua field harga = null.

---

Berdasarkan semua konteks di atas (memori, kalender ekonomi, data pasar,
DAN permintaan user di atas), jawab permintaan user sekarang dalam format
JSON yang diperluas ini.`;
}

// ─── Shared Context Builder ────────────────────────────────────────────────────

function buildSensoryDataWithMeta(
  timeframes: TimeframeData[],
  currentPrice: number,
  tick: { bid: number; ask: number },
  usdProxy: USDProxy | null,
  wibTime: string,
  now: Date
): object {
  const spread = parseFloat((tick.ask - tick.bid).toFixed(2));
  const sensoryData = {
    symbol: "XAUUSD",
    current_price: currentPrice,
    bid: tick.bid,
    ask: tick.ask,
    spread,
    spread_note: spread > 0.5
      ? `LEBAR (${spread}) — likuiditas tipis atau mendekati news`
      : spread > 0.3 ? `NORMAL-TINGGI (${spread})` : `NORMAL (${spread})`,
    market_close_warning: getMarketCloseWarning(),
    usd_context: usdProxy,
    analysis_time: now.toISOString(),
    analysis_time_wib: wibTime,
    trading_session: getTradingSession(),
    timeframes: timeframes.map((tf) => ({
      timeframe: tf.timeframe,
      current_price: tf.current_price,
      ohlc_last_candle: tf.ohlc_last,
      ohlc_recent_candles: tf.ohlc_recent,
      atr_percentile: tf.atr_percentile,
      trend: tf.trend,
      indicators: {
        ema_20: tf.ema_20?.toFixed(2),
        ema_50: tf.ema_50?.toFixed(2),
        ema_200: tf.ema_200?.toFixed(2),
        rsi_14: tf.rsi_14?.toFixed(2),
        rsi_condition: tf.rsi_condition,
        macd: tf.macd ? { line: tf.macd.macd.toFixed(4), signal: tf.macd.signal.toFixed(4), histogram: tf.macd.histogram.toFixed(4) } : null,
        macd_signal: tf.macd_signal,
        bollinger_bands: tf.bollinger ? { upper: tf.bollinger.upper.toFixed(2), middle: tf.bollinger.middle.toFixed(2), lower: tf.bollinger.lower.toFixed(2), bandwidth: tf.bollinger.bandwidth.toFixed(4) } : null,
        bb_price_position: tf.bb_position,
        atr_14: tf.atr_14?.toFixed(2),
        stochastic: tf.stochastic ? { k: tf.stochastic.k.toFixed(2), d: tf.stochastic.d.toFixed(2) } : null,
        stochastic_condition: tf.stoch_condition,
        ichimoku: tf.ichimoku ? { tenkan: tf.ichimoku.tenkan?.toFixed(2), kijun: tf.ichimoku.kijun?.toFixed(2), senkou_a: tf.ichimoku.senkou_a?.toFixed(2), senkou_b: tf.ichimoku.senkou_b?.toFixed(2), cloud_color: tf.ichimoku.cloud_color, price_vs_cloud: tf.ichimoku.price_vs_cloud, tenkan_kijun_cross: tf.ichimoku.tenkan_kijun_cross } : null,
        fibonacci: tf.fibonacci ? { swing_high: tf.fibonacci.swing_high.toFixed(2), swing_low: tf.fibonacci.swing_low.toFixed(2), trend: tf.fibonacci.trend, level_236: tf.fibonacci.level_236.toFixed(2), level_382: tf.fibonacci.level_382.toFixed(2), level_500: tf.fibonacci.level_500.toFixed(2), level_618: tf.fibonacci.level_618.toFixed(2), level_786: tf.fibonacci.level_786.toFixed(2), nearest_level: tf.fibonacci.nearest_level, price_zone: tf.fibonacci.price_zone } : null,
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

  const recentMem = memory.slice(0, 10);
  let waitStreak = 0;
  for (const m of recentMem) { if (m.decision === "WAIT") waitStreak++; else break; }
  const latestBiasH4 = recentMem[0]?.bias?.H4 ?? "NEUTRAL";
  let biasH4Streak = 0;
  for (const m of recentMem) { if (m.bias?.H4 === latestBiasH4) biasH4Streak++; else break; }

  return {
    ...sensoryData,
    analysis_meta: {
      wait_streak_consecutive: waitStreak,
      h4_bias_persistence: `${latestBiasH4} bertahan ${biasH4Streak} siklus berturut-turut`,
    },
  };
}

function buildContextParts(sensoryDataWithMeta: object, calendarSection: string): string[] {
  const memoryContext = buildMemoryContext();
  const marketDataSection = `## 📡 DATA PASAR REAL-TIME SAAT INI\n\n${JSON.stringify(sensoryDataWithMeta, null, 2)}`;
  const parts: string[] = [];
  if (memoryContext) parts.push(memoryContext);
  if (calendarSection) parts.push(calendarSection);
  parts.push(marketDataSection);
  return parts;
}

async function callAI(userMessage: string): Promise<string> {
  const response = await fetch(AI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
      stream: false,
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errText}`);
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

// ─── Main Analysis Function ────────────────────────────────────────────────────

export async function analyzeMarket(
  timeframes: TimeframeData[],
  currentPrice: number,
  tick: { bid: number; ask: number; quote: number; epoch: number },
  usdProxy: USDProxy | null
): Promise<AISignal> {
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

  const sensoryDataWithMeta = buildSensoryDataWithMeta(timeframes, currentPrice, tick, usdProxy, wibTime, now);
  const calendarCtx = await getCalendarContext().catch(() => null);
  const calendarSection = calendarCtx ? formatCalendarForAI(calendarCtx) : "";
  const parts = buildContextParts(sensoryDataWithMeta, calendarSection);
  parts.push("---\n\nBerdasarkan semua konteks di atas (memori, kalender ekonomi, dan data pasar), berikan analisis dan keputusan trading Atlas sekarang:");
  const userMessage = parts.join("\n\n---\n\n");

  const content = await callAI(userMessage);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error({ content }, "AI returned non-JSON response");
    throw new Error("AI did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AISignal;
  if (!["BUY", "SELL", "WAIT"].includes(parsed.decision)) throw new Error(`Invalid decision: ${parsed.decision}`);
  if (parsed.decision === "WAIT") { parsed.entry_price = null; parsed.take_profit = null; parsed.stop_loss = null; parsed.risk_reward_ratio = null; }

  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
  parsed.confluence_score = Math.max(0, Math.min(10, parsed.confluence_score ?? 0));
  parsed.timeframe_bias ??= { H4: "NEUTRAL", H1: "NEUTRAL", M15: "NEUTRAL" };
  parsed.key_levels ??= { nearest_resistance: null, nearest_support: null };
  parsed.market_phase ??= "RANGING";
  parsed.invalidation ??= "-";
  parsed.bull_case ??= "-";
  parsed.bear_case ??= "-";
  parsed.what_would_change_my_mind ??= "-";
  parsed.lesson ??= "-";

  const validation = validateSignal(parsed, currentPrice);
  if (!validation.valid) {
    logger.warn({ reason: validation.reason, originalDecision: parsed.decision }, "Signal geometry invalid — forcing WAIT");
    parsed.decision = "WAIT"; parsed.entry_price = null; parsed.take_profit = null; parsed.stop_loss = null; parsed.risk_reward_ratio = null;
  }

  recordAnalysis(parsed, currentPrice, wibTime);

  if (Array.isArray(parsed.long_term_memory_ops) && parsed.long_term_memory_ops.length > 0) {
    applyLTMOps(parsed.long_term_memory_ops);
    logger.info({ ops: parsed.long_term_memory_ops.map((o) => o.op) }, "Long-term memory updated by AI");
  }

  logger.info({ decision: parsed.decision, confidence: parsed.confidence, memoryEntries: memory.length }, "AI analysis complete (with memory context)");
  return parsed;
}

// ─── On-Demand Analysis Function (/chat) ──────────────────────────────────────

export async function analyzeMarketOnDemand(
  userQuery: string,
  timeframes: TimeframeData[],
  currentPrice: number,
  tick: { bid: number; ask: number; quote: number; epoch: number },
  usdProxy: USDProxy | null
): Promise<OnDemandSignal> {
  const now = new Date();
  const wibTime = now.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const sensoryDataWithMeta = buildSensoryDataWithMeta(timeframes, currentPrice, tick, usdProxy, wibTime, now);
  const calendarCtx = await getCalendarContext().catch(() => null);
  const calendarSection = calendarCtx ? formatCalendarForAI(calendarCtx) : "";
  const parts = buildContextParts(sensoryDataWithMeta, calendarSection);
  parts.push(buildChatAddendum(userQuery));
  const userMessage = parts.join("\n\n---\n\n");

  const content = await callAI(userMessage);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error({ content }, "AI returned non-JSON response (on-demand)");
    throw new Error("AI did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as OnDemandSignal;
  if (!["BUY", "SELL", "WAIT"].includes(parsed.decision)) throw new Error(`Invalid decision: ${parsed.decision}`);

  parsed.setup_type ??= parsed.decision === "WAIT" ? "NO_SETUP" : "IMMEDIATE_ENTRY";
  parsed.pending_order_type ??= null;
  parsed.pending_trigger ??= null;
  parsed.strategy_label ??= "-";
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
  parsed.confluence_score = Math.max(0, Math.min(10, parsed.confluence_score ?? 0));
  parsed.timeframe_bias ??= { H4: "NEUTRAL", H1: "NEUTRAL", M15: "NEUTRAL" };
  parsed.key_levels ??= { nearest_resistance: null, nearest_support: null };
  parsed.market_phase ??= "RANGING";
  parsed.invalidation ??= "-";
  parsed.bull_case ??= "-";
  parsed.bear_case ??= "-";
  parsed.what_would_change_my_mind ??= "-";
  parsed.lesson ??= "-";

  if (parsed.setup_type === "NO_SETUP") {
    parsed.decision = "WAIT";
    parsed.entry_price = null; parsed.take_profit = null;
    parsed.stop_loss = null; parsed.risk_reward_ratio = null;
  } else {
    // Geometry check still applies (SL/TP side relative to entry)
    const validation = validateSignal(parsed, currentPrice);
    if (!validation.valid) {
      logger.warn({ reason: validation.reason }, "On-demand signal geometry invalid — downgrading to NO_SETUP");
      parsed.setup_type = "NO_SETUP";
      parsed.decision = "WAIT";
      parsed.entry_price = null; parsed.take_profit = null;
      parsed.stop_loss = null; parsed.risk_reward_ratio = null;
    }
  }

  // Apply long-term memory ops if any
  if (Array.isArray(parsed.long_term_memory_ops) && parsed.long_term_memory_ops.length > 0) {
    applyLTMOps(parsed.long_term_memory_ops);
    logger.info({ ops: parsed.long_term_memory_ops.map((o) => o.op) }, "Long-term memory updated by AI (on-demand)");
  }

  logger.info({ setup_type: parsed.setup_type, decision: parsed.decision, confidence: parsed.confidence }, "AI on-demand analysis complete");
  return parsed;
}

export function getMemorySnapshot() {
  return {
    entries: memory.slice(0, 10),
    stats: { ...sessionStats },
  };
}
