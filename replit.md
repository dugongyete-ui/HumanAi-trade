# XAUUSD AI Trading Bot — Atlas

Bot Telegram AI **otonom** yang menganalisis pasar emas (XAUUSD) menggunakan multi-timeframe technical analysis, memori AI antar siklus, dan kalender ekonomi real-time. Mengirim sinyal BUY/SELL ke Telegram otomatis setiap 5 menit, monitor TP/SL real-time, kirim notif WIN/LOSS otomatis.

Dilengkapi fitur **mentor on-demand** via `/chat` — AI selalu beri arah BUY/SELL dengan entry, TP, SL konkret.

## Dokumentasi Lengkap

Baca docs ini sebelum melanjutkan development:

- `docs/ARCHITECTURE.md` — Struktur monorepo, stack, dua system prompt, session-aware threshold, routing, env vars, API endpoints
- `docs/BOT_LOGIC.md` — State machine ANALYZING/MONITORING, semua varian indikator, threshold per sesi, /chat on-demand, fallback chain
- `docs/AI_MEMORY.md` — Short-term + long-term memory AI, format konteks, metacognition, persist ke disk
- `docs/SIGNALS.md` — Interface signal, setup types, format pesan Telegram, aturan auto vs mentor mode
- `docs/DEVELOPMENT.md` — Setup dari nol, cara extend bot, cara ubah threshold/prompt, common pitfalls

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
- Build: esbuild (bundle ke `dist/index.mjs`)
- MCP: Python MCP server untuk time & forex session awareness

## File-file Kunci

```
artifacts/api-server/src/lib/
├── scheduler.ts         ← State machine ANALYZING/MONITORING, cron, session-aware thresholds,
│                          chat suppression (90s), TP1/TP2 + trailing SL ke breakeven
├── ai-agent.ts          ← SYSTEM_PROMPT (auto), CHAT_SYSTEM_PROMPT (mentor), callAI(),
│                          analyzeMarket(), analyzeMarketOnDemand(), buildSensoryDataWithMeta(),
│                          fallback chain, AI memory management
├── indicators.ts        ← Semua varian indikator — AI bebas pilih mana yang relevan
│                          (EMA ×9, RSI ×4, MACD ×2, BB ×2, ATR ×3, Stoch ×2, CCI ×2,
│                           Ichimoku, Fibonacci, Williams %R, S/R, Patterns, ATR Percentile)
├── deriv-client.ts      ← Deriv WebSocket, fetch candle M5/M15/H1/H4/D1 + tick
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
data/long_term_notes.json                     ← Long-term memory persist (auto-created)
```

## Desain Indikator — AI Memilih Sendiri

Semua varian dihitung dan dikirim ke AI. AI tidak dipaksa pakai satu set tetap — ia **memilih kombinasi yang paling relevan** sesuai kondisi pasar, dan wajib menyebutkan alasannya di field `reasoning`.

| Kelompok | Varian | Panduan Pemilihan AI |
|---|---|---|
| **EMA** | 8, 13, 20, 21, 34, 50, 89, 100, 200 | Trending → 50/89/200; Scalp → 8/13/21 |
| **RSI** | 7, 9, 14, 21 | Cepat → 7/9; Filter tren → 21 |
| **MACD** | Standar (12,26,9) + Fast (5,13,4) | Fast → M5/M15; Standar → H1/H4 |
| **Bollinger Bands** | 2σ outer + 1σ inner | 2σ extreme; 1σ mean-reversion |
| **ATR** | 7, 14, 21 | Scalp → 7; Default → 14; Swing → 21 |
| **Stochastic** | Standar (14,3,3) + Fast (5,3,3) | Fast → entry timing; Standar → konfirmasi |
| **CCI** | 14 + 20 | 14 sensitif; 20 smooth |
| **Ichimoku** | Standard | Bias tren menengah + S/R dinamis |
| **Fibonacci** | 50-candle | Golden zone 38.2%–61.8% |
| **Williams %R** | 14 | Konfirmasi jenuh beli/jual |
| **Raw OHLCV** | 20 candle terakhir | Baca price action langsung |

## Bot State Machine

```
ANALYZING  →  analisis setiap 5 menit
               AI pilih sendiri indikator & strategi sesuai kondisi
               BUY/SELL lolos session threshold + R:R≥1.5? → kirim sinyal → masuk MONITORING
               WAIT / tidak lolos threshold → tetap ANALYZING

MONITORING →  cek harga tiap 10 detik
               TP1 (50% range) hit → SL pindah ke breakeven
               TP2 hit → WIN → notif Telegram → kembali ANALYZING
               SL hit → LOSS → notif Telegram → kembali ANALYZING

/chat command → analyzeMarketOnDemand() → CHAT_SYSTEM_PROMPT → selalu BUY/SELL
               IMMEDIATE_ENTRY: kondisi layak sekarang
               PENDING_SETUP: entry di level future (boleh jauh dari harga saat ini)
```

## Session-Aware Thresholds (Tidak Hardcoded)

| Sesi | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|
| Asia | 05:00–14:59 | 0.58 | 4 |
| London/NY | 15:00–04:59 | 0.55 | 4 |
| London+NY Overlap | 19:00–22:59 | 0.53 | 4 |

R:R minimum 1.5 berlaku semua sesi.

## Dua System Prompt (Penting!)

| | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` |
|---|---|---|
| Digunakan | Analisis auto cron | `/chat` on-demand |
| Filosofi | Temukan setup — WAIT hanya saat tidak ada struktur | Selalu BUY/SELL, gunakan PENDING_SETUP |
| Hard WAIT? | conf < 0.50, confluence < 4, R:R < 1.5 | Hampir tidak pernah |
| Setup type | IMMEDIATE_ENTRY, NO_SETUP | IMMEDIATE_ENTRY, PENDING_SETUP |
| Harga wajib? | Hanya jika BUY/SELL | Selalu (entry/TP/SL tidak boleh null) |

## AI Memory (per siklus)

AI menerima sebelum analisis:
1. **Long-term memory**: catatan permanen yang AI tulis sendiri (max 10, persist ke disk)
2. **Statistik sesi + metacognition**: total analisis, win/loss rate, confidence bands, bias H4 dominan 5 siklus
3. **Riwayat 10 siklus**: keputusan, harga, confidence, hasil WIN/LOSS
4. **Kalender ekonomi**: event high-impact hari ini + alert level
5. **Data pasar real-time**: 5 timeframe + **semua varian** indikator + analysis_meta

## Architecture Decisions

- **Indikator tidak hardcoded**: semua varian dihitung dan dikirim — AI yang memilih sesuai kondisi pasar
- **Session-aware thresholds**: threshold berbeda per sesi trading (Asia lebih ketat, Overlap paling longgar)
- **Dua prompt terpisah**: auto mode dan mentor mode — jangan digabungkan
- **Analisis 5 menit**: cron `*/5 * * * *` — balance antara responsif dan hemat biaya API
- **State machine**: ANALYZING ↔ MONITORING — tidak analisis saat ada sinyal aktif
- **TP1/TP2 + trailing SL**: TP1 di 50% range sebagai milestone, SL pindah ke breakeven saat TP1 hit
- **Chat suppression**: 90 detik setelah /chat, scheduled WAIT tidak dikirim ke Telegram
- **PENDING_SETUP fallback**: jika AI masih beri null prices → auto-fill dari key_levels + bias
- **Market closed**: Deriv XAUUSD tutup weekend — bot skip siklus, log WARN, retry menit berikutnya. NORMAL.
- **Persistent memory**: short-term + long-term memory di-persist ke disk — tidak reset saat restart
- **Polling mode**: Telegram bot polling (bukan webhook) — cocok karena server always-on
- **Calendar cache**: ForexFactory di-cache 4 jam (memory + disk), rate-limit 429 backoff 15 menit

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
- Signal store reset saat restart (in-memory saja) — win rate dihitung ulang dari nol
- Long-term memory disimpan ke `data/long_term_notes.json` (bukan `ltm.json`)
- Replit free tier: server tidur setelah ~10 menit idle → setup UptimeRobot ping `/api/healthz` setiap 5 menit
- `/chat` punya system prompt berbeda dari auto — jangan ubah salah satu tanpa pertimbangkan yang lain
- Jangan akses port langsung (8080, 23183) — gunakan `localhost:80/api/...`
- `bull_case`, `bear_case`, `what_would_change_my_mind` bisa `string | string[]` dari AI — handle di formatter

## User Preferences

- AI provider: Custom endpoint `https://qwn-api--miok1qpgd.replit.app/v1/chat/completions` (model: qwen3.7-max)
- Bahasa Indonesia untuk semua konten user-facing
- Secrets di Replit Secrets (bukan file .env)
- Analisis setiap 5 menit
