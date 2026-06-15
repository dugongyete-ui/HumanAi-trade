# SIGNALS — Format, Alur, dan Manajemen Sinyal

## Dua Jenis Sinyal

### 1. Auto Signal (dari cron setiap 5 menit)
Dihasilkan oleh `analyzeMarket()` → lolos session-aware threshold → masuk MONITORING mode → monitor TP1/TP2/trailingSL.

### 2. On-Demand Signal (dari `/chat`)
Dihasilkan oleh `analyzeMarketOnDemand()` → tidak masuk MONITORING → hanya panduan.
Selalu berisi arah BUY atau SELL (mentor mode).

---

## Siklus Hidup Sinyal Auto

```
AI beri BUY/SELL (confidence ≥ 0.45 per AI internal)
→ Scheduler cek session threshold (confidence + confluence ≥ session min) + R:R ≥ 1.5
         ↓
storeSignal() → Signal disimpan dengan status "active"
         ↓
sendMessage(formatSignal(signal)) → Kirim ke Telegram
         ↓
Bot masuk MONITORING mode
setInterval 10 detik → fetchCurrentTick() → cek TP1/TP2/trailingSL
         ↓
TP1 hit (50% dari range):
  → Notifikasi "Sebagian target tercapai" ke Telegram
  → SL pindah ke breakeven (= entry price)
  → Terus monitor TP2
         ↓
TP2 hit → WIN | trailingSL hit → LOSS
  → updateSignalResult(id, result, exitPrice)
  → recordMemoryResult(result, exitPrice)
  → sendMessage(formatResult(...))
  → state.mode = "ANALYZING"
```

---

## Session-Aware Thresholds

| Sesi | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|
| Asia | 05:00–14:59 | **0.52** | **4** |
| London/NY | 15:00–18:59 / 23:00–04:59 | **0.49** | **4** |
| London+NY Overlap | 19:00–22:59 | **0.46** | **4** |

R:R minimum **1.5** berlaku di semua sesi.

AI internal hanya WAIT jika confidence < **0.45**. Jika AI beri 0.47 di sesi Overlap (threshold 0.46) → sinyal lolos.

---

## Setup Types

| setup_type | Keterangan | entry_price | Masuk MONITORING? |
|---|---|---|---|
| `IMMEDIATE_ENTRY` | Kondisi layak masuk sekarang | Dekat harga saat ini (±1.5%) | Ya (auto signal) |
| `PENDING_SETUP` | Tunggu harga mencapai level tertentu | Boleh jauh dari harga saat ini | Tidak |
| `NO_SETUP` | Tidak ada kondisi layak (sangat jarang) | null | Tidak |

Untuk `/chat`, AI **selalu** mengembalikan `IMMEDIATE_ENTRY` atau `PENDING_SETUP`.

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
  market_phase: string;
  timeframe_bias: { H4, H1, M15: "BULLISH"|"BEARISH"|"NEUTRAL" };
  confluence_score: number;        // 0-10
  key_levels: { nearest_resistance, nearest_support: number | null };
  market_context: string;
  reasoning: string;               // termasuk indikator yang dipilih AI + mengapa
  invalidation: string;
  bull_case: string | string[];    // bisa array dari AI
  bear_case: string | string[];
  what_would_change_my_mind: string | string[];
  lesson: string;
  long_term_memory_ops: LTMOp[] | null;
}
```

> `bull_case`, `bear_case`, dan `what_would_change_my_mind` bisa `string | string[]`. Helper `toStr()` di `telegram.ts` menangani keduanya.

## Interface OnDemandSignal (untuk /chat)

```typescript
interface OnDemandSignal extends AISignal {
  setup_type: "IMMEDIATE_ENTRY" | "PENDING_SETUP" | "NO_SETUP";
  pending_order_type: "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP" | null;
  pending_trigger: string | null;
  strategy_label: string;
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

📋 Tren naik kuat.

💬 Analisis Atlas:
[reasoning — termasuk indikator yang dipilih AI]

🐂 Bull: [bull_case]
🐻 Bear: [bear_case]

❌ Invalidasi: [kondisi pembatal]

⏰ 15 Jun 2026, 08:45 WIB
```

---

## Format Pesan Telegram — WIN

```
🏆 ATLAS — PROFIT | TAKE PROFIT HIT ✅
━━━━━━━━━━━━━━━━━━━━━━━━
📌 Sinyal: SELL XAUUSD
💰 Entry: $4.346,50
🎯 Exit: $4.321,36
📊 P&L: +25.14 pips
⏱️ Durasi: 18 menit

⏰ 15 Jun 2026, 10:37 WIB

▶️ Atlas melanjutkan analisis otomatis setiap 5 menit...
```

---

## Format Pesan Telegram — LOSS

```
💔 ATLAS — LOSS | STOP LOSS HIT ❌
━━━━━━━━━━━━━━━━━━━━━━━━
📌 Sinyal: SELL XAUUSD
💰 Entry: $4.346,50
🛑 Exit: $4.355,00
📊 P&L: -8.50 pips
⏱️ Durasi: 6 menit

⏰ 15 Jun 2026, 10:25 WIB

▶️ Atlas melanjutkan analisis otomatis setiap 5 menit...
```

---

## Logika Trigger TP/SL

```typescript
// TP1 = 50% dari range entry→TP (milestone breakeven)
// trailingSL = mulai dari SL asli, pindah ke entry saat TP1 hit

// Untuk BUY:
if (price >= tp1 && !tp1Hit) → SL ke breakeven, kirim notif TP1
if (price >= tp2)            → WIN
if (price <= trailingSL)     → LOSS

// Untuk SELL:
if (price <= tp1 && !tp1Hit) → SL ke breakeven, kirim notif TP1
if (price <= tp2)            → WIN
if (price >= trailingSL)     → LOSS
```

Cek setiap **10 detik** via `fetchCurrentTick()` dari Deriv WebSocket.

---

## Aturan Keras — Auto Mode (SYSTEM_PROMPT)

**BUY/SELL wajib diberikan selama:**
- Ada arah yang dapat diidentifikasi dari minimal 2 timeframe
- Ada level S/R logis untuk entry, TP, dan SL
- R:R ≥ 1.5

**WAIT hanya jika salah satu:**
1. Pasar tutup (weekend/holiday)
2. Data tidak tersedia
3. Event HIGH_ALERT dalam < 15 menit DAN tidak ada setup jelas
4. Semua timeframe (H4, H1, M15) benar-benar NEUTRAL tanpa arah — sangat jarang

**Batas minimum (IMMEDIATE_ENTRY saja):**
- confidence < 0.45 → WAIT
- confluence_score < 4 → WAIT
- R:R < 1.5 → WAIT

## Aturan Mentor — On-Demand Mode (CHAT_SYSTEM_PROMPT)

- Selalu beri arah BUY atau SELL
- Default ke `PENDING_SETUP` jika kondisi belum ideal
- `NO_SETUP` hanya jika pasar tutup atau benar-benar tidak ada struktur
- entry_price, take_profit, stop_loss wajib diisi — tidak boleh null

---

## API Endpoints

### GET /api/signals?limit=N
```json
[{
  "id": "7e8317ec-d019-4529-837d-aa3d7d188c14",
  "decision": "SELL",
  "confidence": 0.62,
  "entry_price": 4346.50,
  "take_profit": 4321.36,
  "stop_loss": 4355.00,
  "current_price": 4338.12,
  "timestamp": "2026-06-15T10:18:38.000Z",
  "status": "active",
  "market_phase": "TRENDING_DOWN",
  "confluence_score": 6,
  "reasoning": "...",
  "invalidation": "..."
}]
```

### Win Rate
Hanya sinyal yang sudah closed (tp_hit / sl_hit) yang dihitung. WAIT dan ACTIVE tidak masuk.
