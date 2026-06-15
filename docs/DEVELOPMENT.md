# DEVELOPMENT GUIDE — Cara Lanjutkan Project

## Setup Awal (dari nol)

```bash
# 1. Clone / buka di Replit
# 2. Jalankan installer sekali:
bash install.sh

# 3. Set secrets di Replit Secrets:
#    TELEGRAM_BOT_TOKEN  = token dari @BotFather
#    TELEGRAM_CHAT_ID    = chat ID grup/channel tujuan
#    AI_API_KEY          = bearer key untuk LLM endpoint

# 4. Jalankan bot:
pnpm --filter @workspace/api-server run dev

# 5. Jalankan dashboard (opsional, tab terpisah):
pnpm --filter @workspace/dashboard run dev
```

---

## Workflow Development

```bash
# Typecheck:
pnpm run typecheck

# Setelah ubah OpenAPI spec — regenerate hooks + schemas:
pnpm --filter @workspace/api-spec run codegen

# Build manual api-server:
pnpm --filter @workspace/api-server run build
```

---

## Cara Ubah Logika Bot

### Ubah interval analisis
File: `artifacts/api-server/src/lib/scheduler.ts`
```typescript
const CRON_SCHEDULE = "*/5 * * * *";  // ubah ini
```

### Ubah session-aware threshold
```typescript
function getSessionConfig(): SessionConfig {
  const h = new Date().getUTCHours();
  // Asia session 22:00–07:59 UTC
  if (h >= 22 || h < 8) return { confidenceMin: 0.52, confluenceMin: 4, label: "Asia" };
  // London+NY overlap 12:00–15:59 UTC — paling aktif, paling longgar
  if (h >= 12 && h < 16) return { confidenceMin: 0.46, confluenceMin: 4, label: "London+NY Overlap (aktif)" };
  // London / NY standar
  return { confidenceMin: 0.49, confluenceMin: 4, label: "London/NY (standar)" };
}
```

R:R minimum (1.5) ada di baris cek `risk_reward_ratio` di `scheduler.ts`.

### Ubah threshold AI internal (batas WAIT AI sendiri)
File: `artifacts/api-server/src/lib/ai-agent.ts`, Section 8 SYSTEM_PROMPT:
```
confidence < 0.45 → WAIT  ← ubah angka ini
confluence_score < 4 → WAIT
```

### Ubah temperature AI
```typescript
// Di callAI() di ai-agent.ts:
temperature: 0.65,  // lebih tinggi = lebih kreatif; lebih rendah = lebih deterministik
```

### Ubah interval monitor TP/SL
```typescript
const MONITOR_INTERVAL_MS = 10_000;  // 10 detik
```

### Ubah chat suppression window
```typescript
const CHAT_SUPPRESSION_MS = 90_000;  // 90 detik setelah /chat
```

---

## Cara Ubah Prompt AI

File: `artifacts/api-server/src/lib/ai-agent.ts`

Ada **dua prompt terpisah** — jangan gabungkan:

### `SYSTEM_PROMPT` (auto cron)
- Section 2: Filosofi trading
- Section 4: Kerangka analisis top-down
- Section 5: Daftar indikator yang tersedia (AI bebas pilih)
- Section 6: WAIT streak guard + anti-pattern
- Section 7: Kalibrasi confidence + confluence scoring
- Section 8: Aturan keras (kapan WAIT, kapan wajib BUY/SELL)

### `CHAT_SYSTEM_PROMPT` (mentor on-demand)
Terpisah dari SYSTEM_PROMPT. Tidak ada hard WAIT rules — AI selalu beri BUY/SELL.

### `buildChatAddendum()` (ditambahkan ke user message saat /chat)
Pohon keputusan mentor: IMMEDIATE_ENTRY jika conf ≥ 0.50 + confluence ≥ 4 + R:R ≥ 1.5, selain itu PENDING_SETUP.

> **Backtick di dalam template literal**: gunakan tanda kutip ganda `"reasoning"` bukan backtick `` `reasoning` `` — akan menyebabkan build error.

---

## Cara Menambah Indikator Baru

> Semua kelompok indikator utama sudah ada (14 kelompok). Cek `indicators.ts` sebelum menambah.

Jika memang perlu:
1. Tambah kalkulasi di `artifacts/api-server/src/lib/indicators.ts`
2. Tambah field ke interface `TimeframeData`
3. Tambah ke objek `indicators` per timeframe di `buildSensoryDataWithMeta()` dalam `ai-agent.ts`
4. Tambah ke tabel indikator di Section 5 **kedua** system prompt

---

## Cara Tambah Command Telegram Baru

File: `artifacts/api-server/src/lib/telegram.ts`, di `registerCommands()`:

```typescript
bot.onText(/\/namacommand/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await sendMessage("respons", chatId);
});
```

Juga update teks `/help` di handler `/start`.

---

## Cara Ubah Format Pesan Telegram

File: `artifacts/api-server/src/lib/telegram.ts`
- `formatSignal(signal)` — BUY/SELL/WAIT otomatis
- `formatChatSignal(signal)` — on-demand /chat
- `formatResult(signal, result, exitPrice)` — WIN/LOSS
- `formatPartialTP(signal)` — TP1 hit (breakeven notification)

> `bull_case`, `bear_case`, `what_would_change_my_mind` bisa `string | string[]` — gunakan `toStr()` sebelum memanggil `esc()`.

---

## Cara Buat Sinyal Lebih Sering / Lebih Jarang

**Lebih sering:**
1. Turunkan `confidenceMin` di `getSessionConfig()`
2. Turunkan batas internal AI di Section 8 SYSTEM_PROMPT (sekarang 0.45)
3. Naikkan `temperature` (sekarang 0.65) → AI lebih kreatif temukan setup
4. Ubah panduan kalibrasi di Section 7 → instruksikan AI beri angka lebih tinggi

**Lebih jarang / lebih selektif:**
1. Naikkan threshold di atas
2. Tambahkan kondisi WAIT di Section 8
3. Turunkan temperature (lebih deterministik dan konservatif)

---

## Cara Menambah API Endpoint Baru

1. Edit `lib/api-spec/openapi.yaml`
2. Jalankan `pnpm --filter @workspace/api-spec run codegen`
3. Implementasi route di `artifacts/api-server/src/routes/`
4. Register di `artifacts/api-server/src/routes/index.ts`

---

## Struktur File Kunci

```
artifacts/api-server/src/lib/
├── ai-agent.ts          ← SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, callAI(), memory, prompt builder
├── indicators.ts        ← Semua kalkulasi indikator (semua varian)
├── deriv-client.ts      ← Koneksi Deriv WebSocket
├── scheduler.ts         ← State machine, cron, session thresholds, TP1/TP2
├── signal-store.ts      ← In-memory signals, win rate
├── telegram.ts          ← Bot init, formatters, commands
├── news-calendar.ts     ← ForexFactory calendar, alert levels
├── persistent-memory.ts ← data/memory.json
├── long-term-memory.ts  ← data/long_term_notes.json
└── logger.ts            ← Pino
```

---

## Common Pitfalls

| Masalah | Solusi |
|---|---|
| `market is closed` setiap menit | Normal — pasar Deriv tutup weekend |
| AI terus WAIT | Cek `wait_streak` di log; cek Section 7 & 8 SYSTEM_PROMPT; naikkan temperature |
| Build error "Expected ;" | Ada backtick di dalam template literal — ganti dengan tanda kutip ganda |
| `/chat` masih beri WAIT | Pastikan `CHAT_SYSTEM_PROMPT` dipakai di `callAI()` untuk /chat |
| Sinyal PENDING_SETUP harga null | Fallback di `analyzeMarketOnDemand()` auto-fill dari key_levels |
| Bot tidak respon Telegram | Cek `TELEGRAM_BOT_TOKEN`, cek log polling error |
| Server tidur (free tier) | Setup UptimeRobot ping `/api/healthz` setiap 5 menit |
| Memori AI reset | Cek write permission di folder `data/` |
| `bull_case` TypeScript error | Field adalah `string \| string[]` — gunakan `toStr()` |

---

## Testing Manual

```bash
curl localhost:80/api/healthz
curl localhost:80/api/bot/status
curl -X POST localhost:80/api/bot/analyze
curl "localhost:80/api/signals?limit=5"
curl localhost:80/api/market/current
```

Test via Telegram:
```
/chat analisis posisi sekarang untuk hari ini
/chat ada setup buy atau sell untuk sesi London?
/status
/analyze
```

---

## Deploy ke Production

1. Klik **Deploy** di Replit
2. Pilih **Reserved VM** (always-on, butuh paid tier) atau **Autoscale** + UptimeRobot
3. Setup UptimeRobot dengan URL `.replit.app/api/healthz`
