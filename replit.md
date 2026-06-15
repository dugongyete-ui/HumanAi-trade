# XAUUSD AI Trading Bot — Atlas

Bot Telegram AI **otonom** yang menganalisis pasar emas (XAUUSD) menggunakan multi-timeframe technical analysis, memori AI antar siklus, dan kalender ekonomi real-time. Mengirim sinyal BUY/SELL ke Telegram otomatis setiap 5 menit, monitor TP/SL real-time, kirim notif WIN/LOSS otomatis.

Dilengkapi fitur **mentor on-demand** via `/chat` — AI selalu beri arah BUY/SELL dengan entry, TP, SL konkret.

## Dokumentasi Lengkap

- `docs/ARCHITECTURE.md` — Struktur monorepo, stack, dua system prompt, session-aware threshold, routing, env vars, API endpoints
- `docs/BOT_LOGIC.md` — State machine, threshold per sesi, kebebasan AI memilih strategi & indikator, WAIT streak guard, TP1/TP2
- `docs/AI_MEMORY.md` — Short-term + long-term memory, metacognition, analysis_meta, persist ke disk
- `docs/SIGNALS.md` — Interface signal, setup types, format pesan Telegram, aturan auto vs mentor mode
- `docs/DEVELOPMENT.md` — Setup, cara ubah threshold/prompt/temperature, common pitfalls

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
- Data: Deriv WebSocket API (frxXAUUSD), 5 timeframe: M5/M15/H1/H4/D1
- AI: Custom LLM endpoint (qwen3.7-max via qwn-api), **temperature 0.65**, two-prompt architecture
- Telegram: node-telegram-bot-api (polling mode)
- Scheduler: node-cron (`*/5 * * * *` — setiap 5 menit)
- Monitor: setInterval 10 detik (cek TP1/TP2/trailingSL saat MONITORING mode)
- Kalender: ForexFactory public JSON (gratis, tanpa API key), cache 4 jam
- Frontend: React + Vite + shadcn/ui + Tailwind CSS

## File-file Kunci

```
artifacts/api-server/src/lib/
├── scheduler.ts         ← State machine ANALYZING/MONITORING, cron, session-aware thresholds,
│                          chat suppression (90s), TP1/TP2 + trailing SL ke breakeven
├── ai-agent.ts          ← SYSTEM_PROMPT (auto), CHAT_SYSTEM_PROMPT (mentor), callAI() temp 0.65,
│                          analyzeMarket(), analyzeMarketOnDemand(), buildSensoryDataWithMeta(),
│                          fallback chain, AI memory management
├── indicators.ts        ← Semua varian indikator — AI bebas pilih kombinasi apapun
│                          (EMA ×9, RSI ×4, MACD ×2, BB ×2, ATR ×3, Stoch ×2, CCI ×2,
│                           Ichimoku, Fibonacci, Williams %R, S/R, Patterns, ATR Percentile)
├── deriv-client.ts      ← Deriv WebSocket, fetch candle M5/M15/H1/H4/D1 + tick
├── telegram.ts          ← Bot init, formatSignal, formatChatSignal, formatResult, /chat handler
├── signal-store.ts      ← In-memory signals (max 100), win rate
├── news-calendar.ts     ← ForexFactory calendar, 3 alert levels (CLEAR/CAUTION/HIGH_ALERT)
├── persistent-memory.ts ← Load/save short-term memory ke disk
├── long-term-memory.ts  ← AI-managed long-term notes (ADD/UPDATE/DELETE ops)
└── logger.ts            ← Pino structured logger

data/memory.json              ← Short-term memory persist (auto-created)
data/long_term_notes.json     ← Long-term memory persist (auto-created)
```

## Desain AI — Bebas Pilih, Bebas Rancang

AI **tidak dipaksa** memakai indikator atau strategi tertentu. Setiap siklus, AI melihat semua data dan **merancang sendiri** pendekatan yang paling cocok dengan kondisi pasar saat itu — bisa trend-follow, breakout, range, mean-reversion, price action murni, atau kombinasi apapun.

| Kelompok Indikator | Varian Tersedia |
|---|---|
| **EMA** | 8, 13, 20, 21, 34, 50, 89, 100, 200 |
| **RSI** | 7, 9, 14, 21 |
| **MACD** | Standar (12,26,9) · Fast (5,13,4) |
| **Bollinger Bands** | 2σ outer · 1σ inner |
| **ATR** | 7, 14, 21 + ATR Percentile |
| **Stochastic** | Standar (14,3,3) · Fast (5,3,3) |
| **CCI** | 14 · 20 |
| **Ichimoku** | Standard |
| **Fibonacci** | 50-candle lookback |
| **Williams %R** | 14 |
| **S/R + Patterns** | Key swing levels, Hammer/Engulfing/Doji dll |
| **Raw OHLCV** | 20 candle terakhir |

## Bot State Machine

```
ANALYZING  →  analisis setiap 5 menit
               AI bebas rancang strategi & pilih indikator
               BUY/SELL lolos session threshold + R:R≥1.5? → sinyal → MONITORING
               WAIT / tidak lolos → tetap ANALYZING

MONITORING →  cek harga tiap 10 detik
               TP1 (50% range) hit → SL pindah ke breakeven
               TP2 hit → WIN → notif Telegram → kembali ANALYZING
               trailingSL hit → LOSS → notif Telegram → kembali ANALYZING

/chat → analyzeMarketOnDemand() → CHAT_SYSTEM_PROMPT → selalu BUY/SELL
         IMMEDIATE_ENTRY: kondisi layak sekarang
         PENDING_SETUP: entry di level future
```

## Session-Aware Thresholds

| Sesi | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|
| Asia | 05:00–14:59 | **0.52** | 4 |
| London/NY | 15:00–04:59 | **0.49** | 4 |
| London+NY Overlap | 19:00–22:59 | **0.46** | 4 |

AI internal: WAIT hanya jika confidence < **0.45** (lebih rendah dari semua threshold sesi).
R:R minimum **1.5** berlaku semua sesi.

## Dua System Prompt (Penting!)

| | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` |
|---|---|---|
| Digunakan | Analisis auto cron | `/chat` on-demand |
| Filosofi | Temukan setup — WAIT hanya saat tidak ada struktur | Selalu BUY/SELL, gunakan PENDING_SETUP |
| WAIT rules | conf < 0.45, confluence < 4, R:R < 1.5 | Hampir tidak pernah |
| WAIT streak guard | Ya (≥3 WAIT → wajib re-evaluasi) | N/A |
| Setup type | IMMEDIATE_ENTRY, NO_SETUP | IMMEDIATE_ENTRY, PENDING_SETUP |
| Harga wajib? | Hanya jika BUY/SELL | Selalu (entry/TP/SL tidak boleh null) |

## AI Memory (per siklus)

AI menerima sebelum analisis:
1. **Long-term memory**: catatan permanen AI tulis sendiri (max 10, persist)
2. **Statistik + metacognition**: win rate, confidence bands, phase performance
3. **Riwayat 10 siklus**: keputusan, confidence, hasil WIN/LOSS
4. **analysis_meta**: `wait_streak_consecutive` (trigger re-evaluasi jika ≥3)
5. **Kalender ekonomi**: event hari ini + alert level
6. **Data pasar**: 5 timeframe + semua varian indikator

## Architecture Decisions

- **AI bebas rancang strategi**: tidak ada strategi hardcoded — AI memilih sesuai kondisi saat itu
- **Temperature 0.65**: cukup kreatif untuk temukan setup, tidak terlalu random
- **WAIT streak guard**: AI diperingatkan jika ≥3 WAIT berturut-turut — paksa re-evaluasi
- **Session-aware thresholds**: Asia lebih ketat (0.52), Overlap paling longgar (0.46)
- **TP1/TP2 + trailing SL**: TP1 di 50% range sebagai milestone, SL ke breakeven saat TP1 hit
- **Persistent memory**: short-term + long-term di-persist ke disk — tidak reset saat restart
- **Calendar cache**: 4 jam (memory + disk), rate-limit 429 backoff 15 menit
- **Polling mode**: Telegram bot polling — cocok untuk server always-on

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
- `/pause` / `/resume` — jeda / lanjutkan analisis otomatis
- `/chat <pertanyaan>` — minta panduan trading mentor (selalu beri BUY/SELL konkret)

## Gotchas

- `market is closed` log setiap menit weekend = **NORMAL**, bukan error
- Signal store reset saat restart (in-memory saja) — win rate dihitung ulang dari nol
- Long-term memory: `data/long_term_notes.json` (bukan `ltm.json`)
- Replit free tier: server tidur setelah ~10 menit idle → setup UptimeRobot ping `/api/healthz`
- Backtick di dalam template literal SYSTEM_PROMPT → build error → gunakan tanda kutip ganda
- `/chat` punya system prompt berbeda dari auto — jangan ubah salah satu tanpa mempertimbangkan yang lain
- Jangan akses port langsung (8080, 23183) — gunakan `localhost:80/api/...`
- `bull_case`, `bear_case`, `what_would_change_my_mind` bisa `string | string[]` — handle dengan `toStr()`

## User Preferences

- AI provider: Custom endpoint `https://qwn-api--miok1qpgd.replit.app/v1/chat/completions` (model: qwen3.7-max)
- Bahasa Indonesia untuk semua konten user-facing
- Secrets di Replit Secrets (bukan file .env)
- Analisis setiap 5 menit
