# BOT LOGIC — Atlas State Machine, Threshold, Strategi & On-Demand Chat

## State Machine

Bot beroperasi dalam 2 mode yang berpindah otomatis:

```
┌─────────────────────────────────────────────────────────────────┐
│                       ANALYZING MODE                            │
│  Cron: */5 * * * * (setiap 5 menit)                            │
│  Cek market buka → fetch 5 timeframe → hitung semua indikator  │
│  → inject memori + kalender → kirim ke LLM (temp 0.65)        │
│  → AI rancang strategi sendiri, pilih indikator sendiri        │
│  → BUY/SELL lolos session threshold + R:R ≥ 1.5?              │
│         YES ──────────────────────────────────────────────┐     │
│         NO / WAIT → tetap ANALYZING                       │     │
└───────────────────────────────────────────────────────────│─────┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MONITORING MODE                           │
│  setInterval: setiap 10 detik                                  │
│  Fetch tick harga terkini                                      │
│  TP1 (50% dari range) hit? → SL pindah ke breakeven           │
│  BUY: price ≥ TP2? → WIN | price ≤ trailingSL? → LOSS        │
│  SELL: price ≤ TP2? → WIN | price ≥ trailingSL? → LOSS       │
│  Trigger? → kirim WIN/LOSS ke Telegram                        │
│           → update memori AI                                   │
│           → kembali ke ANALYZING MODE ────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

**File**: `artifacts/api-server/src/lib/scheduler.ts`

---

## Session-Aware Thresholds (Scheduler)

Threshold sinyal berbeda sesuai sesi trading:

| Sesi | Jam UTC | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|---|
| **Asia** | 22:00–07:59 | 05:00–14:59 | **0.52** | **4** |
| **London/NY** | 08:00–11:59 / 16:00–21:59 | 15:00–04:59 | **0.49** | **4** |
| **London+NY Overlap** | 12:00–15:59 | 19:00–22:59 | **0.46** | **4** |

R:R minimum **1.5** berlaku di semua sesi.

> **Catatan**: AI sendiri hanya memutuskan WAIT jika confidence internal < 0.45. Jika AI beri 0.50 dan kita di sesi Overlap (threshold 0.46), sinyal **lolos**.

**Cara mengubah**: edit `getSessionConfig()` di `scheduler.ts`.

---

## Desain AI — Bebas Pilih Indikator, Bebas Rancang Strategi

**File**: `artifacts/api-server/src/lib/ai-agent.ts`

AI **tidak dipaksa** memakai indikator tertentu atau strategi tertentu. Setiap siklus:

1. AI menerima **semua varian semua indikator** sekaligus dari 5 timeframe
2. AI **bebas memilih** kombinasi yang paling relevan untuk kondisi pasar saat itu
3. AI **bebas merancang** strategi apapun yang cocok:

| Strategi | Kondisi Ideal | Indikator Khas |
|---|---|---|
| **Trend-following** | Tren kuat D1/H4 | EMA stack, MACD, ADX-proxy via EMA slope |
| **Breakout** | Konsolidasi ketat, ATR squeeze | BB tight, volume surge, break of structure |
| **Range trading** | Ranging jelas di H1/M15 | RSI, Stoch, BB outer, S/R levels |
| **Mean-reversion** | RSI/Stoch ekstrem + rejection candle | RSI 7/9, Williams %R, Stoch fast, BB 2σ |
| **Momentum** | MACD crossover + EMA alignment | MACD fast, EMA 8/13, RSI 9 |
| **Price action** | Struktur jelas, candle pattern kuat | Raw OHLCV, S/R, Fibonacci, Ichimoku |

AI wajib menyebutkan di field `reasoning`: indikator apa yang dipilih dan mengapa kondisi pasar membuat ia memilihnya.

**Semua varian yang tersedia:**

| Kelompok | Varian |
|---|---|
| **EMA** | 8, 13, 20, 21, 34, 50, 89, 100, 200 |
| **RSI** | 7, 9, 14, 21 |
| **MACD** | Standar (12,26,9) · Fast (5,13,4) |
| **Bollinger Bands** | 2σ outer · 1σ inner |
| **ATR** | 7, 14, 21 + ATR Percentile |
| **Stochastic** | Standar (14,3,3) · Fast (5,3,3) |
| **CCI** | 14 · 20 |
| **Ichimoku** | Standard |
| **Fibonacci** | 50-candle lookback |
| **Williams %R** | 14 |
| **S/R** | Key swing levels |
| **Patterns** | Hammer, Engulfing, Doji, dll |
| **Raw OHLCV** | 20 candle terakhir |

---

## Kalibrasi Confidence AI

| Range | Artinya | Decision AI |
|---|---|---|
| 0.75–1.00 | Mayoritas timeframe & indikator selaras kuat | **BUY/SELL** |
| 0.55–0.74 | Bias jelas, konfluensi cukup, setup layak | **BUY/SELL** |
| 0.45–0.54 | Ada arah + konfirmasi, kondisi kurang sempurna | **BUY/SELL** (SL ketat) |
| < 0.45 | Benar-benar tidak ada struktur/arah | **WAIT** |

**Panduan AI internal** (di prompt):
- H4+H1 sama arah + 1 konfirmasi M15 → minimal 0.58
- + konfluensi indikator → 0.65–0.72
- + USD context + S/R alignment → 0.70–0.80

---

## WAIT Streak Guard

AI membaca field `analysis_meta.wait_streak_consecutive` dari data yang dikirim ke prompt:
- **wait_streak ≥ 3**: AI wajib re-evaluasi — mungkin ada setup yang terlewat
- **wait_streak ≥ 6**: AI hampir pasti harus BUY/SELL kecuali pasar tutup

Ini mencegah AI "terjebak" di mode defensif dan terus WAIT meski ada struktur yang bisa dibaca.

---

## On-Demand Analysis (`/chat` command)

```
User kirim /chat → analyzeMarketOnDemand() → CHAT_SYSTEM_PROMPT → AI
                                                      ↓
                           AI selalu beri BUY atau SELL (IMMEDIATE_ENTRY atau PENDING_SETUP)
                                                      ↓
                                formatChatSignal() → kirim ke Telegram
```

| | **Auto (cron)** | **On-Demand (/chat)** |
|---|---|---|
| System prompt | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` (mentor mode) |
| Boleh WAIT? | Hanya jika conf < 0.45 | Hampir tidak pernah |
| Setup type | IMMEDIATE_ENTRY / NO_SETUP | IMMEDIATE_ENTRY / PENDING_SETUP |
| IMMEDIATE_ENTRY threshold | conf ≥ 0.50, confluence ≥ 4 | sama |
| Masuk MONITORING? | Ya (jika signal valid) | Tidak |

**Suppression window**: Jika user baru saja `/chat` (< 90 detik), scheduler skip pengiriman WAIT biasa ke Telegram.

---

## Parameter & Konstanta

| Parameter | Nilai | Keterangan |
|---|---|---|
| Confidence WAIT (AI internal) | < 0.45 | AI tidak boleh BUY/SELL di bawah ini |
| Confidence min — Asia | 0.52 | Scheduler reject di bawah ini |
| Confidence min — London/NY | 0.49 | Scheduler reject di bawah ini |
| Confidence min — Overlap | 0.46 | Paling longgar — sesi paling aktif |
| Confluence min (semua sesi) | 4/10 | Scheduler reject di bawah ini |
| R:R minimum | 1.5 | Berlaku semua sesi |
| AI temperature | 0.65 | Cukup kreatif, tidak terlalu deterministik |
| Cron schedule | `*/5 * * * *` | Analisis setiap 5 menit |
| Monitor interval | 10 detik | Cek TP/SL saat MONITORING |
| TP1 milestone | 50% dari range entry→TP | Saat hit → SL pindah ke breakeven |
| Chat suppression window | 90 detik | Skip WAIT broadcast setelah /chat |
| Calendar cache TTL | 4 jam | ForexFactory (disk + memory) |
| Memory max entries | 20 | Persist ke disk |

---

## AI Memory System

**File**: `artifacts/api-server/src/lib/ai-agent.ts`, `persistent-memory.ts`

Setiap siklus analisis, AI menerima konteks lengkap:

### 1. Long-Term Memory (AI-Managed)
Catatan permanen yang AI tulis sendiri lintas sesi. Max 10 catatan.
File: `data/long_term_notes.json`

### 2. Statistik Sesi + Metacognition
```
Total analisis: 47 | BUY/SELL: 8 | WAIT: 39
Hasil: 5 WIN / 2 LOSS → Win Rate: 71%
Confidence bands: High (≥0.80): 3W/0L | Medium (0.60–0.79): 2W/2L
Fase 5 siklus: RANGING → RANGING → TRENDING_UP → TRENDING_UP → TRENDING_UP
wait_streak_consecutive: 6 ← AI akan re-evaluasi karena ini
```

### 3. Riwayat 10 Siklus + Refleksi Diri
AI melihat riwayat keputusan terakhir dan menjawab 5 pertanyaan refleksi.

---

## Economic Calendar

Source: ForexFactory JSON feed, cache 4 jam

| Alert | Kondisi | Instruksi ke AI |
|---|---|---|
| ✅ CLEAR | Tidak ada event High dalam 4 jam | Analisis normal |
| ⚡ CAUTION | Ada event High dalam 4 jam | Naikkan kewaspadaan |
| 🚨 HIGH_ALERT | Event High dalam <1 jam | Sangat disarankan WAIT atau SL lebih lebar |

---

## TP1/TP2 + Trailing SL

```
Sinyal SELL: entry $4346.50, TP $4321.36, SL $4355.00
  TP1 = entry - (entry - TP) × 50% = $4333.93

Harga turun ke $4333.93 (TP1 hit):
  → Notifikasi "Sebagian target tercapai" ke Telegram
  → SL pindah ke breakeven (= entry $4346.50)
  
Harga turun ke $4321.36 (TP2 hit): → WIN
Atau harga naik ke $4346.50 (trailing SL = breakeven): → exit breakeven
```

---

## Signal Validation

### `validateSignal()` — untuk IMMEDIATE_ENTRY
Cek geometry SL/TP + proximity entry ke harga saat ini (±1.5%).
Gagal proximity → di-salvage sebagai PENDING_SETUP, bukan dibuang.

### `validateSignalGeometry()` — untuk PENDING_SETUP
Hanya cek SL/TP geometry. Entry boleh jauh dari harga saat ini.

### Fallback Chain (On-Demand `/chat`)
```
AI returns PENDING_SETUP dengan null prices
  → Cek key_levels + timeframe_bias
  → Auto-build PENDING_SETUP dari S/R terdekat
  → Hanya WAIT jika benar-benar tidak ada data sama sekali
```
