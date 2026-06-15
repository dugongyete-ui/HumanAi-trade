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
5. Update section tabel indikator di kedua system prompt: `SYSTEM_PROMPT` dan `CHAT_SYSTEM_PROMPT`

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
const CRON_SCHEDULE = "*/5 * * * *";  // ubah ini
```

### Ubah threshold confidence
```typescript
const CONFIDENCE_THRESHOLD = 0.60;  // ubah ini
```

### Ubah interval monitor TP/SL
```typescript
const MONITOR_INTERVAL_MS = 10_000;  // 10 detik, ubah ini
```

### Ubah chat suppression window
```typescript
const CHAT_SUPPRESSION_MS = 90_000;  // 90 detik, ubah ini
// Di scheduler.ts — durasi setelah /chat dimana WAIT otomatis tidak dikirim ke Telegram
```

### Ubah persona/instruksi AI
File: `artifacts/api-server/src/lib/ai-agent.ts`
- `SYSTEM_PROMPT` — persona dan aturan keras AI untuk analisis auto (cron)
- `CHAT_SYSTEM_PROMPT` — persona mentor AI untuk `/chat` on-demand (tidak ada hard WAIT rules)
- `buildMemoryContext()` — apa yang diingat AI antar siklus
- `formatCalendarForAI()` di `news-calendar.ts` — cara instruksi news

**Penting**: `SYSTEM_PROMPT` dan `CHAT_SYSTEM_PROMPT` adalah dua prompt terpisah. Jangan gabungkan — keduanya punya filosofi berbeda:
- `SYSTEM_PROMPT`: "WAIT adalah keputusan profesional"
- `CHAT_SYSTEM_PROMPT`: "Selalu beri arah BUY atau SELL kepada user"

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

## Cara Ubah Format Pesan Telegram

File: `artifacts/api-server/src/lib/telegram.ts`
- `formatSignal(signal)` — pesan BUY/SELL/WAIT otomatis
- `formatChatSignal(signal)` — pesan on-demand /chat (IMMEDIATE_ENTRY dan PENDING_SETUP)
- `formatResult(signal, result, exitPrice)` — pesan WIN/LOSS

---

## Cara Buat Sinyal Lebih Akurat

Urutan prioritas yang berdampak paling besar:

1. **Perbaiki system prompt** — instruksi ke AI di `SYSTEM_PROMPT` (auto) atau `CHAT_SYSTEM_PROMPT` (chat)
2. **Tambah indikator** — lebih banyak data = AI lebih informasi
3. **Turunkan confidence threshold** — hati-hati, lebih banyak sinyal = lebih banyak noise
4. **Ubah timeframe** — sekarang M5/M15/H1/H4. Tambah D1 untuk bias jangka panjang
5. **Tambah memory entries** — ubah `MAX_MEMORY` dari 20 ke lebih banyak

---

## Cara Ubah Logika Fallback On-Demand

Ketika AI masih mengembalikan NO_SETUP atau PENDING_SETUP dengan null prices dari `/chat`, ada fallback code di `analyzeMarketOnDemand()` di `ai-agent.ts`:

1. **NO_SETUP fallback** → auto-build PENDING_SETUP dari `key_levels` + `timeframe_bias`
2. **PENDING_SETUP null prices** → sama seperti NO_SETUP fallback, menggunakan key levels
3. **PENDING_SETUP decision=WAIT** → auto-koreksi ke BUY/SELL berdasarkan arah TP vs entry

Jika ingin mengubah logika fallback ini, edit section `if (parsed.setup_type === "NO_SETUP")` dan `else if (parsed.setup_type === "PENDING_SETUP")` di fungsi tersebut.

---

## Struktur File Kunci

```
artifacts/api-server/src/lib/
├── ai-agent.ts          ← LLM, SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, memory, prompt building
├── indicators.ts        ← Semua kalkulasi indikator teknikal
├── deriv-client.ts      ← Koneksi Deriv WebSocket, fetch candle/tick
├── scheduler.ts         ← State machine ANALYZING/MONITORING, cron, chat suppression
├── signal-store.ts      ← Penyimpanan sinyal in-memory, win rate
├── telegram.ts          ← Bot init, formatSignal, formatChatSignal, formatResult, commands
├── news-calendar.ts     ← ForexFactory calendar, alert levels
├── persistent-memory.ts ← Load/save memory ke disk (data/memory.json)
├── long-term-memory.ts  ← AI-managed long-term notes (data/ltm.json)
└── logger.ts            ← Pino structured logger
```

---

## Common Pitfalls

| Masalah | Solusi |
|---|---|
| `market is closed` log setiap menit | Normal — pasar Deriv tutup weekend. Bukan error. |
| Dashboard tidak update | Pastikan `pnpm --filter @workspace/api-spec run codegen` sudah dijalankan setelah ubah spec |
| AI tidak kirim sinyal auto | Cek confidence threshold, cek API key, cek log untuk error |
| `/chat` masih beri WAIT | Cek `CHAT_SYSTEM_PROMPT` aktif di `callAI()` — harus pass `CHAT_SYSTEM_PROMPT` bukan default |
| `/chat` beri PENDING_SETUP dengan harga null | Fallback code di `analyzeMarketOnDemand()` akan auto-fill — cek key_levels dari AI ada isinya |
| Bot tidak respon command Telegram | Cek `TELEGRAM_BOT_TOKEN` valid, cek polling error di log |
| Server tidur di Replit free tier | Setup UptimeRobot ping `/api/healthz` setiap 5 menit |
| Memori AI masih reset | Pastikan `data/` folder ada write permission, cek `persistent-memory.ts` load |
| `DATABASE_URL` error | `@workspace/db` tidak dipakai aktif — sudah dihapus dari dependensi api-server |

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

Test command `/chat` via Telegram:
```
/chat analisis posisi sekarang untuk hari ini
/chat ada setup buy atau sell untuk sesi London?
/chat saya mau masuk market, ada rekomendasi?
```

Semua pertanyaan di atas wajib menghasilkan respons dengan entry, TP, SL konkret.

---

## Deploy ke Production

1. Klik tombol **Deploy** di Replit
2. Pilih **Reserved VM** (untuk bot yang always-on, butuh paid tier)
3. Atau gunakan **Autoscale** + UptimeRobot (free tier workaround)
4. Setelah deploy, setup UptimeRobot dengan URL `.replit.app`

Production health check path: `/api/healthz` (sudah dikonfigurasi di `artifact.toml`)
