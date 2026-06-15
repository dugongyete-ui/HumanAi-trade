# BOT LOGIC — Atlas State Machine, Threshold, Indikator & On-Demand Chat

## State Machine

Bot beroperasi dalam 2 mode yang berpindah otomatis:

```
┌─────────────────────────────────────────────────────────────────┐
│                       ANALYZING MODE                            │
│  Cron: */5 * * * * (setiap 5 menit)                            │
│  Cek market buka → fetch 5 timeframe → hitung semua indikator  │
│  → inject memori + kalender → kirim ke LLM                     │
│  → AI pilih sendiri indikator & strategi sesuai kondisi        │
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

## Session-Aware Thresholds

Threshold tidak fix — berubah sesuai sesi trading aktif agar lebih adaptif:

| Sesi | Jam UTC | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|---|
| **Asia** | 22:00–07:59 | 05:00–14:59 | **0.58** | **4** |
| **London/NY** | 08:00–11:59 / 16:00–21:59 | 15:00–04:59 | **0.55** | **4** |
| **London+NY Overlap** | 12:00–15:59 | 19:00–22:59 | **0.53** | **4** |

R:R minimum **1.5** berlaku di semua sesi.

**Cara mengubah**: edit `getSessionConfig()` di `scheduler.ts`.

---

## Indikator Teknikal — AI Memilih Sendiri

**File**: `artifacts/api-server/src/lib/indicators.ts`

Semua varian dihitung dan dikirim ke AI. AI **tidak dipaksa** memakai satu set tetap — ia memilih kombinasi yang paling relevan sesuai kondisi pasar saat itu.

| Indikator | Varian Tersedia | Kapan AI Memilih |
|---|---|---|
| **EMA** | 8, 13, 20, 21, 34, 50, 89, 100, 200 | Trending → EMA lambat (50/89/200); Scalp → EMA cepat (8/13/21) |
| **RSI** | 7, 9, 14, 21 | RSI-7/9 konfirmasi cepat; RSI-21 filter tren |
| **MACD** | Standar (12,26,9) + Fast (5,13,4) | Fast untuk M5/M15; Standar untuk H1/H4 |
| **Bollinger Bands** | 2σ outer + 1σ inner | 2σ extreme moves; 1σ mean-reversion entry |
| **ATR** | 7, 14, 21 | ATR-7 scalp; ATR-14 default; ATR-21 swing |
| **Stochastic** | Standar (14,3,3) + Fast (5,3,3) | Fast M5 entry timing; Standar konfirmasi |
| **CCI** | 14 + 20 | CCI-14 sensitif; CCI-20 smooth |
| **Ichimoku** | Standard | Bias tren jangka menengah + S/R dinamis |
| **Fibonacci** | 50-candle lookback | Golden zone 38.2%–61.8% re-entry |
| **Williams %R** | 14 | Konfirmasi jenuh beli/jual bersama Stochastic |
| **Support/Resistance** | Swing structure | Level kritis dari swing high/low |
| **Candlestick Patterns** | Hammer, Doji, Engulfing, dll | Price action konfirmasi entry |
| **ATR Percentile** | Relatif 20-periode | <80% squeeze; 80–120% normal; >120% volatil |
| **Raw OHLCV** | 20 candle terakhir | AI membaca price action langsung |

AI **wajib menyebutkan** dalam field `reasoning` varian mana yang dipilih dan mengapa.

---

## On-Demand Analysis (`/chat` command)

Selain analisis otomatis, user bisa minta analisis langsung via Telegram `/chat <pertanyaan>`.

```
User kirim /chat → analyzeMarketOnDemand() → CHAT_SYSTEM_PROMPT → AI
                                                      ↓
                           AI selalu beri BUY atau SELL (IMMEDIATE_ENTRY atau PENDING_SETUP)
                                                      ↓
                                formatChatSignal() → kirim ke Telegram
```

**Perbedaan penting dengan analisis otomatis:**

| | **Auto (cron)** | **On-Demand (/chat)** |
|---|---|---|
| System prompt | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` (mentor mode) |
| Boleh WAIT? | Ya (jika tidak ada struktur) | Hampir tidak pernah |
| Setup type | IMMEDIATE_ENTRY / NO_SETUP | IMMEDIATE_ENTRY / PENDING_SETUP |
| Masuk MONITORING? | Ya (jika signal valid) | Tidak |
| Tujuan | Trading otomatis | Panduan mentor untuk user |

**Suppression window**: Jika user baru saja `/chat` (< 90 detik), scheduler skip pengiriman sinyal WAIT biasa ke Telegram untuk menghindari "noise" setelah chat analysis.

---

## Parameter & Konstanta

| Parameter | Nilai | Keterangan |
|---|---|---|
| Confidence minimum (Asia) | 0.58 | Session-aware threshold |
| Confidence minimum (London/NY) | 0.55 | Session-aware threshold |
| Confidence minimum (Overlap) | 0.53 | Sesi paling aktif — paling longgar |
| Confluence minimum (semua sesi) | 4/10 | Di bawah ini → tidak kirim sinyal (auto mode) |
| R:R minimum | 1.5 | Di bawah ini → tidak kirim sinyal (auto mode) |
| Confidence WAIT (AI internal) | < 0.50 | AI tidak boleh BUY/SELL di bawah ini |
| Cron schedule | `*/5 * * * *` | Analisis setiap 5 menit |
| Monitor interval | 10 detik | Cek TP/SL saat MONITORING |
| TP1 milestone | 50% dari range entry→TP | Saat hit → SL pindah ke breakeven |
| Chat suppression window | 90 detik | Skip WAIT broadcast setelah /chat |
| Market cache TTL | 3 menit | Cache hasil `checkMarketOpen()` |
| Calendar cache TTL | 4 jam | Cache ForexFactory feed (disk + memory) |
| Memory max entries | 20 | Simpan 20 siklus terakhir (persist ke disk) |

---

## AI Memory System

**File**: `artifacts/api-server/src/lib/ai-agent.ts`, `persistent-memory.ts`

Setiap siklus analisis, AI **bukan** mulai dari nol. AI menerima konteks:

### 1. Statistik Sesi (dengan Metacognition)
```
Total analisis: 47 | BUY/SELL: 8 | WAIT: 39
Hasil: 5 WIN / 2 LOSS → Win Rate: 71%
Confidence bands: High (≥0.80): 3W/0L | Medium (0.60–0.79): 2W/2L
Fase 5 siklus: RANGING → RANGING → TRENDING_UP → TRENDING_UP → TRENDING_UP
Bias H4 dominan: NEUTRAL (3 siklus berturut-turut)
```

### 2. Riwayat 10 Siklus Terakhir
```
1. [08:45 WIB] BUY | $3345.20 | conf:72% | TRENDING_UP | bias H4:BULLISH
   Entry:$3343.00 TP:$3358.00 SL:$3336.00
   → ✅ WIN (exit $3358.20)
2. [08:30 WIB] WAIT | $3341.80 | conf:44% | CONSOLIDATION
   "Pasar konsolidasi, menunggu breakout..."
```

### 3. Instruksi Refleksi Diri (5 pertanyaan)
1. Apakah kondisi berubah dari siklus sebelumnya?
2. Jika ada sinyal aktif — harga sudah ke mana?
3. Jika baru LOSS — apa yang keliru?
4. Apakah bias H4 berubah konsisten (tanda tren nyata)?
5. Jika ≥3 WAIT berturut-turut — ada setup yang terlewat?

### 4. Long-Term Memory (AI-Managed)
AI bisa menyimpan catatan permanen antar sesi via field `long_term_memory_ops` dalam JSON output-nya:
- `ADD` — tambah insight baru (max 10 catatan)
- `UPDATE` — perbarui catatan yang ada (by ID)
- `DELETE` — hapus catatan yang sudah tidak relevan

**File**: `artifacts/api-server/src/lib/long-term-memory.ts`
**Disk**: `data/long_term_notes.json`

---

## Economic Calendar (News Awareness)

**File**: `artifacts/api-server/src/lib/news-calendar.ts`

Source: ForexFactory public JSON — `https://nfs.faireconomy.media/ff_calendar_thisweek.json`

3 Level Alert yang diinjek ke AI:

| Alert | Kondisi | Instruksi ke AI |
|---|---|---|
| ✅ CLEAR | Tidak ada event High dalam 4 jam | Analisis normal |
| ⚡ CAUTION | Ada event High dalam 4 jam | Naikkan kewaspadaan confluence |
| 🚨 HIGH_ALERT | Event High dalam <1 jam | Sangat disarankan WAIT; SL 1.5–2x ATR |

Event yang dianggap relevan untuk XAUUSD:
- Semua event `impact: "High"` dari USD
- Event High dari EUR, GBP, JPY, CHF (sentimen risk global)

Cache: 4 jam (memory + disk). Rate-limit 429 backoff 15 menit.

---

## Signal Validation (Dua Jenis)

**File**: `artifacts/api-server/src/lib/ai-agent.ts`

### `validateSignal(signal, currentPrice)` — untuk IMMEDIATE_ENTRY
Cek penuh: geometry SL/TP + proximity entry ke harga saat ini (±1.5%).
Jika gagal proximity → di-salvage sebagai PENDING_SETUP, bukan dibuang.

### `validateSignalGeometry(signal)` — untuk PENDING_SETUP
Hanya cek SL/TP geometry (sisi yang benar). Tidak cek proximity — entry boleh jauh dari harga saat ini.

### Fallback Chain (On-Demand `/chat`)
```
AI returns NO_SETUP / PENDING_SETUP dengan null prices
        ↓
Cek key_levels + timeframe_bias
        ↓
Ada bias + support/resistance? → Auto-build PENDING_SETUP
  - BULLISH bias → BUY_LIMIT at nearest_support
  - BEARISH bias → SELL_LIMIT at nearest_resistance
        ↓
Tidak ada data sama sekali? → WAIT (sangat jarang, < 1% kasus)
```

---

## TP1/TP2 + Trailing SL (MONITORING Mode)

```
Sinyal BUY: entry $3343, TP $3358, SL $3336
  TP1 = entry + (TP - entry) × 50% = $3350.5
  
Harga naik ke $3350.5 (TP1 hit):
  → Notifikasi "TP1 hit!" ke Telegram
  → SL pindah ke breakeven (= entry $3343)
  → Tunggu TP2 ($3358)
  
Harga naik ke $3358 (TP2 hit):
  → WIN! Notifikasi ke Telegram
  → Kembali ANALYZING
  
Atau harga turun ke $3343 (trailing SL = breakeven):
  → Exit breakeven (tidak LOSS, tidak WIN — LOSS dihitung jika di bawah entry awal)
```

---

## Deriv WebSocket Client

**File**: `artifacts/api-server/src/lib/deriv-client.ts`

- Symbol: `frxXAUUSD`
- Jadwal pasar: **Senin–Jumat**
  - Buka: 00:00 UTC (07:00 WIB)
  - Tutup: Jumat ~20:55 UTC (~03:55 WIB Sabtu)
- Market closed → `MarketClosedError` → bot skip siklus, retry menit berikutnya
- Pre-check via `active_symbols` API sebelum fetch candle (hemat request)
- USD Proxy: EURUSD H1 sebagai proxy kekuatan dolar (EMA8 sebagai trend filter)
- Multiplexed single WebSocket connection — tidak buka koneksi baru per request
