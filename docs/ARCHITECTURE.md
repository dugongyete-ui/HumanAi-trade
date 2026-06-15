# ARCHITECTURE — XAUUSD AI Trading Bot (Atlas)

## Gambaran Besar

Bot trading XAUUSD otonom yang:
1. Mengambil data candle real-time dari Deriv WebSocket API (5 timeframe: M5/M15/H1/H4/D1)
2. Menghitung **semua varian** 14+ kelompok indikator teknikal — AI bebas pilih mana yang relevan
3. Menginjek long-term memory + short-term memory + kalender ekonomi + data pasar ke LLM
4. LLM (qwen3.7-max) **merancang strategi sendiri** — bebas pilih indikator, gaya trading, dan setup
5. Jika BUY/SELL lolos session-aware threshold → kirim sinyal ke Telegram, masuk mode MONITORING
6. Monitor harga real-time tiap 10 detik (TP1 → breakeven → TP2 / SL) → kirim WIN/LOSS → kembali ANALYZING

Ditambah fitur **on-demand mentor** via `/chat` Telegram — AI selalu beri arah BUY/SELL dengan harga konkret.

---

## Monorepo Structure

```
workspace/
├── artifacts/
│   ├── api-server/          ← Backend utama (Express 5, port 8080)
│   │   └── src/
│   │       ├── lib/         ← Semua logika inti bot
│   │       ├── routes/      ← REST API endpoints
│   │       └── index.ts     ← Entry point, init bot + telegram
│   └── dashboard/           ← Frontend React (port 23183, path /dashboard)
│       └── src/
│           ├── pages/       ← dashboard.tsx (satu halaman)
│           └── components/  ← shadcn/ui components
├── lib/
│   ├── api-spec/            ← OpenAPI YAML (source of truth)
│   ├── api-zod/             ← Zod schemas (auto-generated dari OpenAPI)
│   ├── api-client-react/    ← React Query hooks (auto-generated)
│   └── db/                  ← Drizzle ORM config (belum dipakai aktif)
├── mcp-servers/
│   └── time/server.py       ← Python MCP server (time & forex session tools)
├── scripts/                 ← Utility scripts
├── docs/                    ← Dokumentasi project ini
├── install.sh               ← One-shot installer
├── mcp.json                 ← MCP server config
└── pnpm-workspace.yaml      ← Workspace catalog + overrides
```

---

## Path Routing (Reverse Proxy)

```
localhost:80/api/*        → api-server (port 8080)
localhost:80/dashboard/*  → dashboard (port 23183)
```

Semua request melalui proxy di port 80. **Jangan akses service langsung via port mereka.**
Gunakan `localhost:80/api/healthz` bukan `localhost:8080/api/healthz`.

---

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| Runtime | Node.js 24, TypeScript 5.9 |
| Backend | Express 5 |
| Data pasar | Deriv WebSocket API (`frxXAUUSD`) |
| AI | Custom LLM endpoint (qwen3.7-max via `qwn-api`), temperature 0.65 |
| Telegram | node-telegram-bot-api (polling mode) |
| Scheduler | node-cron (`*/5 * * * *`) |
| Frontend | React + Vite + shadcn/ui + Tailwind CSS |
| Validasi | Zod v4, drizzle-zod |
| Codegen | Orval (OpenAPI → React Query hooks + Zod schemas) |
| Build | esbuild (bundle ke `dist/index.mjs`) |
| Logger | Pino (structured JSON logs) |
| Kalender | ForexFactory public JSON feed (gratis, tanpa API key) |
| MCP Server | Python `mcp` package (time & forex session awareness) |

---

## Lib Kunci di api-server

```
artifacts/api-server/src/lib/
├── ai-agent.ts          ← Dua system prompt (SYSTEM_PROMPT + CHAT_SYSTEM_PROMPT),
│                          callAI() [temperature 0.65], analyzeMarket(),
│                          analyzeMarketOnDemand(), buildSensoryDataWithMeta(),
│                          buildMemoryContext(), validateSignal(), validateSignalGeometry()
├── indicators.ts        ← Semua varian indikator — AI bebas pilih kombinasi apapun
│                          (EMA ×9, RSI ×4, MACD ×2, BB ×2, ATR ×3, Stoch ×2, CCI ×2,
│                           Ichimoku, Fibonacci, Williams %R, S/R, Patterns, ATR Percentile)
├── deriv-client.ts      ← Deriv WebSocket, fetch candle M5/M15/H1/H4/D1 + tick
├── scheduler.ts         ← State machine ANALYZING/MONITORING, cron, session-aware thresholds,
│                          chat suppression (90s), TP1/TP2 + trailing SL ke breakeven
├── signal-store.ts      ← In-memory signals (max 100), win rate
├── telegram.ts          ← Bot init, formatSignal, formatChatSignal, formatResult, /chat handler
├── news-calendar.ts     ← ForexFactory calendar, 3 alert levels (CLEAR/CAUTION/HIGH_ALERT)
├── persistent-memory.ts ← Load/save short-term memory ke disk (data/memory.json)
├── long-term-memory.ts  ← AI-managed long-term notes, ops: ADD/UPDATE/DELETE
│                          (data/long_term_notes.json)
└── logger.ts            ← Pino structured logger
```

---

## Desain AI — Bebas Pilih, Bebas Rancang

AI **tidak dibatasi** kombinasi indikator atau strategi tertentu. Setiap siklus, AI:
1. Membaca semua data dari 5 timeframe + semua varian indikator
2. **Memilih sendiri** indikator mana yang paling relevan untuk kondisi pasar saat itu
3. **Merancang strategi** yang paling cocok (trend-follow, breakout, range, mean-reversion, momentum)
4. Wajib menjelaskan pilihannya di field `reasoning`

Ini berbeda dari sistem "jika RSI < 30 maka BUY" — AI berpikir holistik seperti trader manusia.

---

## Dua System Prompt (AI)

| | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` |
|---|---|---|
| Digunakan oleh | `analyzeMarket()` (cron) | `analyzeMarketOnDemand()` (/chat) |
| Filosofi | "Temukan setup — WAIT hanya saat pasar benar-benar tidak terbaca" | "Selalu beri arah BUY atau SELL" |
| Hard WAIT rules | Ya (conf < 0.45, confluence < 4, R:R < 1.5) | Tidak |
| WAIT streak guard | Ya — jika ≥3 WAIT berturut-turut, wajib re-evaluasi | N/A |
| Setup types | IMMEDIATE_ENTRY, NO_SETUP | IMMEDIATE_ENTRY, PENDING_SETUP |
| Prices wajib | Hanya jika BUY/SELL | Selalu wajib (entry/TP/SL tidak boleh null) |

---

## Session-Aware Thresholds (Scheduler)

| Sesi | Jam UTC | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|---|
| Asia | 22:00–07:59 | 05:00–14:59 | **0.52** | 4 |
| London/NY | 08:00–11:59 / 16:00–21:59 | 15:00–04:59 | **0.49** | 4 |
| London+NY Overlap | 12:00–15:59 | 19:00–22:59 | **0.46** | 4 |

R:R minimum **1.5** berlaku di semua sesi. AI sendiri hanya WAIT jika confidence < **0.45**.

---

## Shared Libraries (`lib/`)

### `@workspace/api-spec`
- File: `lib/api-spec/openapi.yaml`
- Source of truth untuk semua API contracts

### `@workspace/api-zod`
- Auto-generated dari OpenAPI spec
- Regenerate: `pnpm --filter @workspace/api-spec run codegen`

### `@workspace/api-client-react`
- Auto-generated React Query hooks
- Dashboard menggunakannya: `useGetBotStatus()`, `useGetSignals()`, dll

---

## Environment Variables

| Variable | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token dari @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Chat ID tujuan sinyal |
| `AI_API_KEY` | ✅ | Bearer key untuk custom LLM endpoint |
| `AI_API_URL` | ❌ | Default: `https://qwn-api--miok1qpgd.replit.app/v1/chat/completions` |
| `AI_MODEL` | ❌ | Default: `qwen3.7-max` |
| `PORT` | ❌ | Diset otomatis oleh Replit workflow |

Semua disimpan di Replit Secrets (bukan `.env` file).

---

## API Endpoints

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/healthz` | Health check (dipakai UptimeRobot) |
| GET | `/api/bot/status` | Status bot lengkap (mode, activeSignal, winRate, dll) |
| POST | `/api/bot/start` | Jalankan bot |
| POST | `/api/bot/stop` | Hentikan bot |
| POST | `/api/bot/analyze` | Trigger analisis manual |
| GET | `/api/signals?limit=N` | Riwayat sinyal (max 100) |
| GET | `/api/market/current` | Harga XAUUSD terkini + bid/ask |
| GET | `/api/calendar` | Event kalender ekonomi + alert level |

---

## Telegram Commands

| Command | Keterangan |
|---|---|
| `/start`, `/help` | Daftar semua perintah |
| `/analyze` | Trigger analisis manual sekarang |
| `/status` | Mode bot, sinyal aktif, win rate, next analysis |
| `/pause` | Jeda analisis otomatis |
| `/resume` | Lanjutkan analisis otomatis |
| `/chat <pertanyaan>` | Minta panduan trading langsung (mentor mode, selalu BUY/SELL) |

---

## Deployment

- **Development**: `pnpm --filter @workspace/api-server run dev`
- **Production**: Deploy via Replit → domain `*.replit.app`
- **Keep alive (free tier)**: UptimeRobot ping `/api/healthz` setiap 5 menit
- **Persistent data**: `data/memory.json`, `data/long_term_notes.json` — tidak hilang saat restart
