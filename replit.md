# XAUUSD AI Trading Bot — Atlas

Bot Telegram AI **otonom** yang menganalisis pasar emas (XAUUSD) menggunakan multi-timeframe technical analysis, memori AI antar siklus, dan kalender ekonomi real-time. Mengirim sinyal BUY/SELL ke Telegram otomatis setiap 5 menit, monitor TP/SL real-time, kirim notif WIN/LOSS otomatis.

## 📚 Dokumentasi Lengkap

Baca docs ini sebelum melanjutkan development:

- `docs/ARCHITECTURE.md` — Struktur monorepo, stack, routing, env vars, API endpoints
- `docs/BOT_LOGIC.md` — State machine ANALYZING/MONITORING, indikator, Deriv client, alur lengkap
- `docs/AI_MEMORY.md` — Sistem memori AI (cara AI "ingat" siklus sebelumnya), format konteks
- `docs/SIGNALS.md` — Format sinyal, alur TP/SL, format pesan Telegram WIN/LOSS, API response
- `docs/DEVELOPMENT.md` — Setup dari nol, cara extend bot, common pitfalls, cara deploy

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
- AI: Custom LLM endpoint (qwen3.7-max via qwn-api) + in-memory AI memory system
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
├── scheduler.ts       ← State machine ANALYZING/MONITORING, cron, monitor TP/SL
├── ai-agent.ts        ← LLM call, memori AI, prompt building (memori + kalender + pasar)
├── indicators.ts      ← 10+ indikator teknikal (EMA, RSI, MACD, BB, ATR, Stoch, Ichimoku, Fib, WilliamsR, CCI)
├── deriv-client.ts    ← Deriv WebSocket, fetch candle M5/M15/H1/H4 + tick
├── telegram.ts        ← Bot init, formatSignal, formatResult, command handlers
├── signal-store.ts    ← In-memory signals (max 100), win rate
├── news-calendar.ts   ← ForexFactory calendar, 3 alert levels (CLEAR/CAUTION/HIGH_ALERT)
└── logger.ts          ← Pino structured logger

artifacts/dashboard/src/pages/dashboard.tsx   ← Dashboard utama
lib/api-spec/openapi.yaml                     ← API contract (source of truth)
mcp-servers/time/server.py                    ← Python MCP time server
install.sh                                    ← One-shot installer
```

## Bot State Machine

```
ANALYZING  →  analisis setiap 5 menit
               BUY/SELL conf≥60%? → kirim sinyal → masuk MONITORING
               WAIT / conf<60%   → tetap ANALYZING

MONITORING →  cek harga tiap 10 detik
               TP hit → WIN → notif Telegram → kembali ANALYZING
               SL hit → LOSS → notif Telegram → kembali ANALYZING
```

## AI Memory (per siklus)

AI menerima sebelum analisis:
1. **Statistik sesi**: total analisis, win/loss rate, bias H4 dominan 5 siklus
2. **Riwayat 10 siklus**: keputusan, harga, confidence, hasil WIN/LOSS
3. **Kalender ekonomi**: event high-impact hari ini + alert level
4. **Data pasar real-time**: 4 timeframe + 10+ indikator

## Architecture Decisions

- **Analisis 5 menit**: cron `*/5 * * * *` — balance antara responsif dan hemat biaya API
- **State machine**: ANALYZING ↔ MONITORING — tidak analisis saat ada sinyal aktif
- **Market closed**: Deriv XAUUSD tutup weekend — bot skip siklus, log WARN, retry menit berikutnya. NORMAL.
- **Confidence threshold**: 60% minimum untuk kirim sinyal ke Telegram
- **In-memory**: Sinyal (max 100) + memori AI (max 20 siklus) di RAM — reset saat restart
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

## Gotchas

- `market is closed` log setiap menit weekend = **NORMAL**, bukan error
- `DATABASE_URL` — `@workspace/db` tidak dipakai aktif dan sudah dihapus dari dependensi api-server
- Replit free tier: server tidur setelah ~10 menit idle → setup UptimeRobot ping `/api/healthz` setiap 5 menit
- Memori AI & sinyal reset saat server restart (in-memory)
- Jangan akses port langsung (8080, 23183) — gunakan `localhost:80/api/...`

## User Preferences

- AI provider: Custom endpoint `https://qwn-api--miok1qpgd.replit.app/v1/chat/completions` (model: qwen3.7-max)
- Bahasa Indonesia untuk semua konten user-facing
- Secrets di Replit Secrets (bukan file .env)
- Analisis setiap 5 menit
