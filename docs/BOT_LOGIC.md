# BOT LOGIC — Atlas State Machine & AI Memory

## State Machine

Bot beroperasi dalam 2 mode yang berpindah otomatis:

```
┌─────────────────────────────────────────────────────────┐
│                   ANALYZING MODE                        │
│  Cron: */5 * * * * (setiap 5 menit)                    │
│  Cek market buka → fetch 4 timeframe → hitung indikator │
│  → inject memori + kalender → kirim ke LLM             │
│  → BUY/SELL conf≥60%?                                  │
│         YES ──────────────────────────────────────┐     │
│         NO / WAIT → tetap ANALYZING               │     │
└───────────────────────────────────────────────────│─────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────┐
│                   MONITORING MODE                       │
│  setInterval: setiap 10 detik                          │
│  Fetch tick harga terkini                              │
│  BUY: price ≥ TP? → WIN | price ≤ SL? → LOSS          │
│  SELL: price ≤ TP? → WIN | price ≥ SL? → LOSS         │
│  Trigger? → kirim WIN/LOSS ke Telegram                 │
│           → update memori AI                           │
│           → kembali ke ANALYZING MODE ─────────────────┘
└─────────────────────────────────────────────────────────┘
```

**File**: `artifacts/api-server/src/lib/scheduler.ts`

---

## Threshold & Parameter

| Parameter | Nilai | Keterangan |
|---|---|---|
| Confidence minimum | 60% | Di bawah ini → tidak kirim sinyal, tidak masuk MONITORING |
| Cron schedule | `*/5 * * * *` | Analisis setiap 5 menit |
| Monitor interval | 10 detik | Cek TP/SL saat MONITORING |
| Market cache TTL | 3 menit | Cache hasil `checkMarketOpen()` supaya tidak hit Deriv API setiap menit |
| Calendar cache TTL | 1 jam | Cache ForexFactory feed |
| Memory max entries | 20 | Simpan 20 siklus terakhir di RAM |

---

## AI Memory System

**File**: `artifacts/api-server/src/lib/ai-agent.ts`

Setiap siklus analisis, AI **bukan** mulai dari nol. AI menerima konteks:

### 1. Statistik Sesi
```
Total analisis: 47 | BUY/SELL: 8 | WAIT: 39
Hasil: 5 WIN / 2 LOSS → Win Rate: 71%
Fase 5 siklus: RANGING → RANGING → TRENDING_UP → TRENDING_UP → TRENDING_UP
Bias H4 dominan: NEUTRAL → NEUTRAL → BULLISH → BULLISH → BULLISH
```

### 2. Riwayat 10 Siklus Terakhir
```
1. [08:45 WIB] BUY | $2345.20 | conf:72% | TRENDING_UP | bias H4:BULLISH
   Entry:$2343.00 TP:$2358.00 SL:$2336.00
   → ✅ WIN (exit $2358.20)
2. [08:44 WIB] WAIT | $2341.80 | conf:44% | CONSOLIDATION
   "Pasar konsolidasi, menunggu breakout..."
```

### 3. Instruksi Refleksi Diri (5 pertanyaan)
1. Apakah kondisi berubah dari siklus sebelumnya?
2. Jika ada sinyal aktif — harga sudah ke mana?
3. Jika baru LOSS — apa yang keliru?
4. Apakah bias H4 berubah konsisten (tanda tren nyata)?
5. Jika ≥3 WAIT berturut-turut — ada setup yang terlewat?

### Siklus Hidup Memori

```typescript
// Setelah setiap analisis:
recordAnalysis(signal, currentPrice, wibTime)

// Setelah TP/SL hit:
recordSignalResult("WIN" | "LOSS", exitPrice)
```

**Catatan**: Memori bersifat in-memory (RAM). Reset saat server restart.

---

## Data yang Diterima AI Per Siklus

```
[Memori 10 siklus + statistik + refleksi diri]
         +
[Kalender ekonomi: event hari ini, 4 jam ke depan, alert level]
         +
[Data pasar real-time:]
  - Harga XAUUSD terkini
  - Waktu WIB + sesi trading aktif
  - M5 candles (100 candle)
  - M15 candles (100 candle)
  - H1 candles (100 candle)
  - H4 candles (100 candle)
  - Per timeframe: EMA20/50/200, RSI, MACD, BB, ATR, Stochastic,
    Ichimoku, Fibonacci, Williams %R, CCI, S/R levels,
    candlestick patterns
```

---

## Economic Calendar (News Awareness)

**File**: `artifacts/api-server/src/lib/news-calendar.ts`

Source: ForexFactory public JSON — `https://nfs.faireconomy.media/ff_calendar_thisweek.json`

3 Level Alert yang diinjek ke AI:

| Alert | Kondisi | Instruksi ke AI |
|---|---|---|
| ✅ CLEAR | Tidak ada event High dalam 4 jam | Analisis normal |
| ⚡ CAUTION | Ada event High dalam 4 jam | Naikkan confluence ke 7/10 |
| 🚨 HIGH_ALERT | Event High dalam <1 jam | Sangat disarankan WAIT; SL 1.5–2x ATR |

Event yang dianggap relevan untuk XAUUSD:
- Semua event `impact: "High"` dari USD
- Event High dari EUR, GBP, JPY, CHF (sentimen risk global)

---

## Indikator Teknikal

**File**: `artifacts/api-server/src/lib/indicators.ts`

| Indikator | Fungsi |
|---|---|
| EMA 20/50/200 | Tren & dynamic S/R |
| RSI (14) | Momentum & overbought/oversold |
| MACD (12,26,9) | Perubahan momentum & divergence |
| Bollinger Bands (20,2) | Volatilitas & squeeze detection |
| ATR (14) | Ukuran SL/TP berdasarkan volatilitas aktual |
| Stochastic (14,3,3) | Konfirmasi jenuh beli/jual di TF rendah |
| Ichimoku Cloud | Bias tren jangka menengah + momentum |
| Fibonacci Retracement | Golden zone 38.2%–61.8% untuk re-entry |
| Williams %R (14) | Konfirmasi reversal bersama Stochastic |
| CCI (20) | Divergence & kondisi ekstrem |
| Support/Resistance | Level kritis dari swing high/low |
| Candlestick Patterns | Hammer, Doji, Engulfing, dll |

---

## Deriv WebSocket Client

**File**: `artifacts/api-server/src/lib/deriv-client.ts`

- Symbol: `frxXAUUSD`
- Jadwal pasar: **Senin–Jumat**
  - Buka: 00:00 UTC (07:00 WIB)
  - Tutup: Jumat ~20:55 UTC (~03:55 WIB Sabtu)
- Market closed → `MarketClosedError` → bot skip siklus, retry menit berikutnya
- Pre-check via `active_symbols` API sebelum fetch candle (hemat request)

---

## Signal Store

**File**: `artifacts/api-server/src/lib/signal-store.ts`

```typescript
interface Signal extends AISignal {
  id: string;
  timestamp: string;
  current_price: number;
  status: "active" | "tp_hit" | "sl_hit" | "wait";
  exit_price?: number;
  exit_time?: string;
  result?: "WIN" | "LOSS";
}
```

- In-memory, max 100 sinyal
- Reset saat server restart
- `getWinRate()` → `{ wins, losses, rate }`

---

## Telegram Bot

**File**: `artifacts/api-server/src/lib/telegram.ts`

Mode: **Polling** (cocok untuk server yang always-on)

Commands:
- `/start` / `/help` — daftar perintah
- `/analyze` — trigger analisis manual sekarang
- `/status` — tampilkan mode, sinyal aktif, win rate, next analysis
- `/pause` — jeda analisis otomatis
- `/resume` — lanjutkan analisis otomatis

Format sinyal dikirim ke Telegram:
- `formatSignal(signal)` — pesan BUY/SELL/WAIT lengkap
- `formatResult(signal, result, exitPrice)` — pesan WIN/LOSS setelah TP/SL
