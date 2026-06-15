# SIGNALS — Format, Alur, dan Manajemen Sinyal

## Dua Jenis Sinyal

### 1. Auto Signal (dari cron setiap 5 menit)
Dihasilkan oleh `analyzeMarket()` → lolos session-aware threshold → masuk MONITORING mode → monitor TP1/TP2/SL.

### 2. On-Demand Signal (dari `/chat`)
Dihasilkan oleh `analyzeMarketOnDemand()` → tidak masuk MONITORING → hanya panduan.
Selalu berisi arah BUY atau SELL (mentor mode).

---

## Siklus Hidup Sinyal Auto

```
AI memberi BUY/SELL
→ lolos session threshold (confidence + confluence) + R:R ≥ 1.5
         ↓
storeSignal() → Signal disimpan dengan status "active"
         ↓
sendMessage(formatSignal(signal)) → Kirim ke Telegram
         ↓
Bot masuk MONITORING mode
setInterval 10 detik → fetchCurrentTick() → cek TP1/TP2/trailingSL
         ↓
TP1 hit (50% dari range):
  → notifikasi "Sebagian target tercapai" ke Telegram
  → SL pindah ke breakeven
  → terus monitor TP2
         ↓
TP2 hit → WIN:
  updateSignalResult(id, "WIN", exitPrice)  ← update signal store
  recordMemoryResult("WIN", exitPrice)      ← update AI memory
  sendMessage(formatResult(...))            ← kirim WIN ke Telegram
  state.mode = "ANALYZING"                 ← kembali analisis

SL hit → LOSS:
  updateSignalResult(id, "LOSS", exitPrice)
  recordMemoryResult("LOSS", exitPrice)
  sendMessage(formatResult(...))
  state.mode = "ANALYZING"
```

---

## Session-Aware Thresholds (Auto Mode)

| Sesi | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|
| Asia | 05:00–14:59 | 0.58 | 4 |
| London/NY | 15:00–18:59 / 23:00–04:59 | 0.55 | 4 |
| London+NY Overlap | 19:00–22:59 | 0.53 | 4 |

R:R minimum **1.5** berlaku di semua sesi.

---

## Setup Types

| setup_type | Keterangan | entry_price | Masuk MONITORING? |
|---|---|---|---|
| `IMMEDIATE_ENTRY` | Kondisi layak masuk sekarang | Dekat harga saat ini (±1.5%) | Ya (auto signal) |
| `PENDING_SETUP` | Tunggu harga mencapai level tertentu | Boleh jauh dari harga saat ini | Tidak |
| `NO_SETUP` | Tidak ada kondisi layak (sangat jarang) | null | Tidak |

Untuk `/chat`, AI **selalu** mengembalikan `IMMEDIATE_ENTRY` atau `PENDING_SETUP` — `NO_SETUP` dengan decision `WAIT` hampir tidak pernah terjadi.

---

## Interface AISignal (Auto)

```typescript
interface AISignal {
  decision: "BUY" | "SELL" | "WAIT";
  confidence: number;              // 0.0 – 1.0
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  risk_reward_ratio: number | null;
  market_phase: string;            // "TRENDING_UP", "RANGING", dll
  timeframe_bias: { H4, H1, M15: "BULLISH"|"BEARISH"|"NEUTRAL" };
  confluence_score: number;        // 0-10
  key_levels: { nearest_resistance, nearest_support: number | null };
  market_context: string;
  reasoning: string;               // termasuk indikator mana yang dipilih AI dan mengapa
  invalidation: string;
  bull_case: string | string[];    // bisa array dari AI
  bear_case: string | string[];
  what_would_change_my_mind: string | string[];
  lesson: string;
  long_term_memory_ops: LTMOp[] | null;
}
```

> **Catatan**: `bull_case`, `bear_case`, dan `what_would_change_my_mind` bisa berupa `string` atau `string[]` tergantung output AI. Formatters di `telegram.ts` menangani keduanya — array dijoins dengan " • ".

## Interface OnDemandSignal (untuk /chat)

Extends AISignal dengan field tambahan:

```typescript
interface OnDemandSignal extends AISignal {
  setup_type: "IMMEDIATE_ENTRY" | "PENDING_SETUP" | "NO_SETUP";
  pending_order_type: "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP" | null;
  pending_trigger: string | null;  // kondisi konfirmasi saat harga tiba di entry
  strategy_label: string;          // satu kalimat ringkas strategi
}
```

## Interface Signal (disimpan di signal-store)

```typescript
interface Signal extends AISignal {
  id: string;                      // UUID
  timestamp: string;               // ISO UTC
  current_price: number;           // harga tick saat analisis
  status: "active" | "tp_hit" | "sl_hit" | "wait";
  exit_price?: number;             // harga saat TP/SL hit
  exit_time?: string;              // ISO UTC
  result?: "WIN" | "LOSS";
}
```

---

## Format Pesan Telegram — BUY/SELL (Auto)

```
🟢 ATLAS — BUY | XAUUSD
━━━━━━━━━━━━━━━━━━━━━━━━
💹 Harga: $3.345,20
🗺️ Fase Pasar: 📈 Trending Naik
📊 Confidence: 72% [███████░░░]
🔗 Confluence: 7/10 [■■■■■■■□□□]

🧭 Bias Timeframe:
  H4 🟢  H1 🟢  M15 🟢

💰 Entry: $3.343,00
🎯 Take Profit: $3.358,00
🛡️ Stop Loss: $3.336,00
📐 Risk/Reward: 1:2.14
🏔️ Resistance: $3.360,00  🏔️ Support: $3.330,00

📋 Tren naik kuat dengan EMA-50/89 stack bullish di H4/H1.

💬 Analisis Atlas:
[reasoning lengkap dari AI — termasuk indikator yang dipilih]

🐂 Bull: [bull_case]
🐻 Bear: [bear_case]

❌ Invalidasi: Harga tutup di bawah EMA-50 H1 ($3.338)

⏰ 15 Jun 2026, 08:45 WIB
```

---

## Format Pesan Telegram — PENDING_SETUP (dari /chat)

```
⏳ ATLAS MENTOR — PENDING BUY | XAUUSD
━━━━━━━━━━━━━━━━━━━━━━━━
📌 BUY LIMIT — Tunggu Pullback
🏷️ Swing Low Demand Zone — BUY LIMIT H1 target 3:1

💹 Harga Saat Ini: $3.356,80
📈 Fase Pasar: Konsolidasi

🎯 Level Entry: $3.335,00
📐 Risk/Reward: 1:3.20

📋 Kondisi Entry:
Tunggu harga pullback ke $3.335,00. Konfirmasi dengan bullish engulfing/pin bar di M15 sebelum eksekusi.

💰 Jika entry tereksekusi:
  🎯 Take Profit: $3.358,00
  🛡️ Stop Loss:   $3.327,50

💬 Analisis Atlas:
[reasoning lengkap dari AI]

⚠️ Invalidasi: [kondisi yang membatalkan setup]

🧠 Insight: [lesson dari kondisi saat ini]

⏰ 15 Jun 2026, 08:45 WIB
```

---

## Format Pesan Telegram — WIN

```
🏆 ATLAS — PROFIT | TAKE PROFIT HIT ✅
━━━━━━━━━━━━━━━━━━━━━━━━
📌 Sinyal: BUY XAUUSD
💰 Entry: $3.343,00
🎯 Exit: $3.358,20
📊 P&L: +15.20 pips
⏱️ Durasi: 23 menit

⏰ 15 Jun 2026, 09:08 WIB

▶️ Atlas melanjutkan analisis otomatis setiap 5 menit...
```

---

## Format Pesan Telegram — LOSS

```
💔 ATLAS — LOSS | STOP LOSS HIT ❌
━━━━━━━━━━━━━━━━━━━━━━━━
📌 Sinyal: BUY XAUUSD
💰 Entry: $3.343,00
🛑 Exit: $3.335,80
📊 P&L: -7.20 pips
⏱️ Durasi: 11 menit

⏰ 15 Jun 2026, 08:56 WIB

▶️ Atlas melanjutkan analisis otomatis setiap 5 menit...
```

---

## Logika Trigger TP/SL

```typescript
// TP1 = 50% dari range entry→TP (breakeven milestone)
// TP2 = TP asli (final target)
// trailingSL = awalnya SL asli, pindah ke entry saat TP1 hit

// Untuk BUY:
if (price >= tp1 && !tp1Hit) → TP1 hit → SL ke breakeven
if (price >= tp2)            → WIN
if (price <= trailingSL)     → LOSS (atau exit breakeven jika SL sudah pindah)

// Untuk SELL:
if (price <= tp1 && !tp1Hit) → TP1 hit → SL ke breakeven
if (price <= tp2)            → WIN
if (price >= trailingSL)     → LOSS
```

Cek dilakukan setiap **10 detik** menggunakan `fetchCurrentTick()` dari Deriv WebSocket.

---

## API Endpoints Sinyal

### GET /api/signals?limit=N
Kembalikan N sinyal terakhir (max 100).

```json
[
  {
    "id": "uuid",
    "decision": "BUY",
    "confidence": 0.72,
    "entry_price": 3343.00,
    "take_profit": 3358.00,
    "stop_loss": 3336.00,
    "current_price": 3345.20,
    "timestamp": "2026-06-15T01:45:22.000Z",
    "status": "tp_hit",
    "result": "WIN",
    "exit_price": 3358.20,
    "exit_time": "2026-06-15T02:08:14.000Z",
    "market_phase": "TRENDING_UP",
    "confluence_score": 7,
    "reasoning": "...",
    "invalidation": "..."
  }
]
```

### GET /api/bot/status
Termasuk `activeSignal`, `winRate`, `mode`:

```json
{
  "running": true,
  "paused": false,
  "mode": "MONITORING",
  "lastAnalysis": "2026-06-15T01:45:22.000Z",
  "totalSignals": 8,
  "activeSignal": {
    "decision": "BUY",
    "entry_price": 3343.00,
    "take_profit": 3358.00,
    "stop_loss": 3336.00,
    "timestamp": "2026-06-15T01:45:22.000Z"
  },
  "winRate": { "wins": 5, "losses": 2, "rate": 71 },
  "nextAnalysisIn": null
}
```

---

## Win Rate Calculation

```typescript
export function getWinRate(): { wins: number; losses: number; rate: number } {
  const closed = signals.filter((s) => s.result);         // hanya yang sudah closed
  const wins = closed.filter((s) => s.result === "WIN").length;
  const losses = closed.filter((s) => s.result === "LOSS").length;
  return {
    wins,
    losses,
    rate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
  };
}
```

Sinyal WAIT dan sinyal yang masih ACTIVE tidak dihitung dalam win rate.

---

## Aturan Keras — Auto Mode (SYSTEM_PROMPT)

- Jangan BUY/SELL jika confidence < **0.50** (AI internal rule)
- Jangan BUY/SELL jika confluence_score < **4**
- Jangan BUY/SELL jika R:R < **1.5**
- WAIT hanya saat pasar benar-benar tanpa struktur — bukan karena kondisi kurang sempurna
- TP/SL harus berdasarkan ATR dan level S/R, bukan angka bulat
- Selalu sertakan `invalidation` (kondisi yang membatalkan analisis)
- AI wajib sebutkan di `reasoning` indikator mana yang dipilih dan mengapa

## Aturan Mentor — On-Demand Mode (CHAT_SYSTEM_PROMPT)

- Selalu beri arah BUY atau SELL — tidak ada kondisi yang "benar-benar tanpa pandangan"
- Gunakan `PENDING_SETUP` jika kondisi belum ideal sekarang — entry boleh jauh dari harga saat ini
- `NO_SETUP` dengan decision `WAIT` hanya boleh jika pasar tutup atau benar-benar tidak ada struktur sama sekali
- Confidence dan confluence boleh rendah untuk PENDING_SETUP — mengukur keyakinan pada level, bukan entry sekarang
- entry_price, take_profit, stop_loss wajib diisi angka nyata — tidak boleh null
