# XAUUSD AI Trading Bot — Atlas

Bot Telegram AI **otonom** yang menganalisis pasar emas (XAUUSD) menggunakan multi-timeframe technical analysis, memori AI antar siklus, dan kalender ekonomi real-time. Mengirim sinyal BUY/SELL ke Telegram otomatis setiap 5 menit, monitor TP/SL real-time, kirim notif WIN/LOSS otomatis.

Dilengkapi fitur **mentor on-demand** via `/chat` — AI selalu beri arah BUY/SELL dengan entry, TP, SL konkret.

## Dokumentasi Lengkap

Baca docs ini sebelum melanjutkan development:

- `docs/ARCHITECTURE.md` — Struktur monorepo, stack, dua system prompt, routing, env vars, API endpoints
- `docs/BOT_LOGIC.md` — State machine ANALYZING/MONITORING, /chat on-demand, indikator, fallback chain
- `docs/AI_MEMORY.md` — Short-term + long-term memory AI, format konteks, persist ke disk
- `docs/SIGNALS.md` — Interface signal, setup types, format pesan Telegram, aturan auto vs mentor mode
- `docs/DEVELOPMENT.md` — Setup dari nol, cara extend bot, two-prompt architecture, common pitfalls

## Run & Operate

```bash
bash install.sh                                         # setup sekali dari nol
pnpm --filter @workspace/api-server run dev             # API server + bot (port 8080)
pnpm --filter @workspace/dashboard run dev              # Dashboard web (port 23183)
pnpm run typecheck                                      # full typecheck semua packages
pnpm --filter @workspace/api-spec run codegen           # regenerate API hooks dari OpenAPI spec
```

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, Logger: Pino
- Data: Deriv WebSocket API (frxXAUUSD)
- AI: Custom LLM endpoint (qwen3.7-max via qwn-api) + two-prompt architecture (auto + mentor)
- Telegram: node-telegram-bot-api (polling mode)
- Scheduler: node-cron (`*/5 * * * *` — setiap 5 menit)
- Monitor: setInterval 10 detik (cek TP/SL saat MONITORING mode)
- Kalender: ForexFactory public JSON (gratis, tanpa API key)
- Frontend: React + Vite + shadcn/ui + Tailwind CSS
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (dari OpenAPI spec)
- Build: esbuild (CJS bundle ke `dist/index.mjs`)
- MCP: Python MCP server untuk time & forex session awareness

## File-file Kunci

```
artifacts/api-server/src/lib/
├── scheduler.ts         ← State machine ANALYZING/MONITORING, cron, chat suppression (90s)
├── ai-agent.ts          ← SYSTEM_PROMPT (auto), CHAT_SYSTEM_PROMPT (mentor), callAI(),
│                          analyzeMarket(), analyzeMarketOnDemand(), fallback chain
├── indicators.ts        ← 10+ indikator teknikal (EMA, RSI, MACD, BB, ATR, Stoch, Ichimoku, Fib, WilliamsR, CCI)
├── deriv-client.ts      ← Deriv WebSocket, fetch candle M5/M15/H1/H4 + tick
├── telegram.ts          ← Bot init, formatSignal, formatChatSignal, formatResult, /chat handler
├── signal-store.ts      ← In-memory signals (max 100), win rate
├── news-calendar.ts     ← ForexFactory calendar, 3 alert levels (CLEAR/CAUTION/HIGH_ALERT)
├── persistent-memory.ts ← Load/save short-term memory ke disk
├── long-term-memory.ts  ← AI-managed long-term notes (ADD/UPDATE/DELETE ops)
└── logger.ts            ← Pino structured logger

artifacts/dashboard/src/pages/dashboard.tsx   ← Dashboard utama
lib/api-spec/openapi.yaml                     ← API contract (source of truth)
mcp-servers/time/server.py                    ← Python MCP time server
install.sh                                    ← One-shot installer
data/memory.json                              ← Short-term memory persist (auto-created)
data/ltm.json                                 ← Long-term memory persist (auto-created)
```

## Bot State Machine

```
ANALYZING  →  analisis setiap 5 menit
               BUY/SELL conf≥60% + confluence≥5 + R:R≥1.5? → kirim sinyal → masuk MONITORING
               WAIT / conf<60%   → tetap ANALYZING

MONITORING →  cek harga tiap 10 detik
               TP hit → WIN → notif Telegram → kembali ANALYZING
               SL hit → LOSS → notif Telegram → kembali ANALYZING

/chat command → analyzeMarketOnDemand() → CHAT_SYSTEM_PROMPT → selalu BUY/SELL
               IMMEDIATE_ENTRY: kondisi layak sekarang
               PENDING_SETUP: entry di level future (boleh jauh dari harga saat ini)
```

## Dua System Prompt (Penting!)

| | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` |
|---|---|---|
| Digunakan | Analisis auto cron | `/chat` on-demand |
| WAIT boleh? | Ya | Hampir tidak pernah |
| Setup type | IMMEDIATE_ENTRY, NO_SETUP | IMMEDIATE_ENTRY, PENDING_SETUP |
| Harga wajib? | Hanya jika BUY/SELL | Selalu (entry/TP/SL tidak boleh null) |

## AI Memory (per siklus)

AI menerima sebelum analisis:
1. **Long-term memory**: catatan permanen yang AI tulis sendiri (max 10, persist ke disk)
2. **Statistik sesi**: total analisis, win/loss rate, bias H4 dominan 5 siklus
3. **Riwayat 10 siklus**: keputusan, harga, confidence, hasil WIN/LOSS
4. **Kalender ekonomi**: event high-impact hari ini + alert level
5. **Data pasar real-time**: 4 timeframe + 10+ indikator + analysis_meta

## Architecture Decisions

- **Dua prompt terpisah**: auto mode (hard WAIT rules) dan mentor mode (selalu BUY/SELL) — jangan digabungkan
- **Analisis 5 menit**: cron `*/5 * * * *` — balance antara responsif dan hemat biaya API
- **State machine**: ANALYZING ↔ MONITORING — tidak analisis saat ada sinyal aktif
- **Chat suppression**: 90 detik setelah /chat, scheduled WAIT tidak dikirim ke Telegram
- **PENDING_SETUP fallback**: jika AI masih beri null prices → auto-fill dari key_levels + bias
- **Market closed**: Deriv XAUUSD tutup weekend — bot skip siklus, log WARN, retry menit berikutnya. NORMAL.
- **Confidence threshold**: 60% minimum untuk kirim sinyal otomatis ke Telegram
- **Persistent memory**: short-term + long-term memory di-persist ke disk — tidak reset saat restart
- **Polling mode**: Telegram bot polling (bukan webhook) — cocok karena server always-on
- **Calendar cache**: ForexFactory di-cache 1 jam, market status 3 menit

## Environment Variables (Replit Secrets)

| Variable | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token dari @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Chat ID tujuan sinyal |
| `AI_API_KEY` | ✅ | Bearer key untuk LLM endpoint |
| `AI_API_URL` | ❌ | Default: qwn-api endpoint |
| `AI_MODEL` | ❌ | Default: qwen3.7-max |

## Telegram Commands

- `/start` / `/help` — daftar perintah
- `/analyze` — trigger analisis manual
- `/status` — mode bot, sinyal aktif, win rate, next analysis
- `/pause` — jeda analisis otomatis
- `/resume` — lanjutkan analisis otomatis
- `/chat <pertanyaan>` — minta panduan trading mentor (selalu beri BUY/SELL konkret)

## Gotchas

- `market is closed` log setiap menit weekend = **NORMAL**, bukan error
- `DATABASE_URL` — `@workspace/db` tidak dipakai aktif dan sudah dihapus dari dependensi api-server
- Replit free tier: server tidur setelah ~10 menit idle → setup UptimeRobot ping `/api/healthz` setiap 5 menit
- `/chat` dua system prompt berbeza dari auto — jangan ubah salah satu tanpa pertimbangkan yang lain
- Jangan akses port langsung (8080, 23183) — gunakan `localhost:80/api/...`

## User Preferences

- AI provider: Custom endpoint `https://qwn-api--miok1qpgd.replit.app/v1/chat/completions` (model: qwen3.7-max)
- Bahasa Indonesia untuk semua konten user-facing
- Secrets di Replit Secrets (bukan file .env)
- Analisis setiap 5 menit
