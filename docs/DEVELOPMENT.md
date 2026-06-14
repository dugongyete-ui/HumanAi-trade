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

### Jalankan di Replit
Bot dan dashboard berjalan via **Replit Workflows** — bukan `pnpm dev` di terminal.
- Workflow sudah dikonfigurasi otomatis
- Gunakan tombol Run di Replit, atau:

```bash
# Typecheck saja (tanpa run):
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/dashboard run typecheck

# Typecheck semua:
pnpm run typecheck
```

### Setelah ubah OpenAPI spec
```bash
pnpm --filter @workspace/api-spec run codegen
```
Ini regenerate Zod schemas di `lib/api-zod/` dan React Query hooks di `lib/api-client-react/`.

### Setelah ubah shared lib
```bash
pnpm run typecheck:libs
```

---

## Cara Menambah Indikator Baru

1. Edit `artifacts/api-server/src/lib/indicators.ts`
2. Tambah field baru ke `TimeframeData` interface
3. Implementasi kalkulasi di fungsi `buildTimeframeData()`
4. Tambah field ke `sensoryData` di `ai-agent.ts` (bagian `indicators` per timeframe)
5. Update system prompt di `ai-agent.ts` section 5 (tabel Interpretasi Indikator)

---

## Cara Menambah API Endpoint Baru

1. Buka `lib/api-spec/openapi.yaml` — **tambahkan di sini dulu**
2. Jalankan codegen: `pnpm --filter @workspace/api-spec run codegen`
3. Implementasi route di `artifacts/api-server/src/routes/`
4. Import dan register di `artifacts/api-server/src/routes/index.ts`
5. Dashboard otomatis bisa pakai hook yang baru di-generate

---

## Cara Ubah Logika Bot

### Ubah interval analisis
File: `artifacts/api-server/src/lib/scheduler.ts`
```typescript
const CRON_SCHEDULE = "*/1 * * * *";  // ubah ini
```

### Ubah threshold confidence
```typescript
const CONFIDENCE_THRESHOLD = 0.60;  // ubah ini
```

### Ubah interval monitor TP/SL
```typescript
const MONITOR_INTERVAL_MS = 10_000;  // 10 detik, ubah ini
```

### Ubah persona/instruksi AI
File: `artifacts/api-server/src/lib/ai-agent.ts`
- `SYSTEM_PROMPT` — persona dan aturan keras AI
- `buildMemoryContext()` — apa yang diingat AI antar siklus
- `formatCalendarForAI()` di `news-calendar.ts` — cara instruksi news

---

## Cara Ubah Format Pesan Telegram

File: `artifacts/api-server/src/lib/telegram.ts`
- `formatSignal(signal)` — pesan BUY/SELL/WAIT
- `formatResult(signal, result, exitPrice)` — pesan WIN/LOSS

---

## Cara Tambah Command Telegram Baru

File: `artifacts/api-server/src/lib/telegram.ts`, di fungsi `registerCommands()`:

```typescript
bot.onText(/\/namacommand/, async (msg) => {
  const chatId = msg.chat.id.toString();
  // logika kamu di sini
  await sendMessage("respons", chatId);
});
```

Juga update teks `/help` di handler `/start`.

---

## Cara Buat Sinyal Lebih Akurat

Urutan prioritas yang berdampak paling besar:

1. **Perbaiki system prompt** — instruksi ke AI di `SYSTEM_PROMPT`
2. **Tambah indikator** — lebih banyak data = AI lebih informasi
3. **Turunkan confidence threshold** — hati-hati, lebih banyak sinyal = lebih banyak noise
4. **Ubah timeframe** — sekarang M5/M15/H1/H4. Tambah D1 untuk bias jangka panjang
5. **Tambah memory entries** — ubah `MAX_MEMORY` dari 20 ke lebih banyak

---

## Struktur File Kunci

```
artifacts/api-server/src/lib/
├── ai-agent.ts        ← LLM, memory system, prompt building
├── indicators.ts      ← Semua kalkulasi indikator teknikal
├── deriv-client.ts    ← Koneksi Deriv WebSocket, fetch candle/tick
├── scheduler.ts       ← State machine ANALYZING/MONITORING, cron
├── signal-store.ts    ← Penyimpanan sinyal in-memory, win rate
├── telegram.ts        ← Bot init, format pesan, command handlers
├── news-calendar.ts   ← ForexFactory calendar, alert levels
└── logger.ts          ← Pino structured logger
```

---

## Common Pitfalls

| Masalah | Solusi |
|---|---|
| `market is closed` log setiap menit | Normal — pasar Deriv tutup weekend. Bukan error. |
| Dashboard tidak update | Pastikan `pnpm --filter @workspace/api-spec run codegen` sudah dijalankan setelah ubah spec |
| AI tidak kirim sinyal | Cek confidence threshold, cek API key, cek log untuk error |
| Bot tidak respon command Telegram | Cek `TELEGRAM_BOT_TOKEN` valid, cek polling error di log |
| Server tidur di Replit free tier | Setup UptimeRobot ping `/api/healthz` setiap 5 menit |
| Memori AI reset | Normal setelah restart — memori in-memory. Implementasi persistent JSON jika perlu |
| `DATABASE_URL` error | `@workspace/db` butuh ini — provision via Replit Database atau comment import |

---

## Testing Manual

```bash
# Cek server hidup:
curl localhost:80/api/healthz

# Cek status bot:
curl localhost:80/api/bot/status

# Trigger analisis manual:
curl -X POST localhost:80/api/bot/analyze

# Lihat sinyal terakhir:
curl "localhost:80/api/signals?limit=5"

# Cek harga terkini:
curl localhost:80/api/market/current
```

---

## Deploy ke Production

1. Klik tombol **Deploy** di Replit
2. Pilih **Reserved VM** (untuk bot yang always-on, butuh paid tier)
3. Atau gunakan **Autoscale** + UptimeRobot (free tier workaround)
4. Setelah deploy, setup UptimeRobot dengan URL `.replit.app`

Production health check path: `/api/healthz` (sudah dikonfigurasi di `artifact.toml`)
