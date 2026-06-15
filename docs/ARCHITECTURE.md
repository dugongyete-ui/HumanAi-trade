# ARCHITECTURE — XAUUSD AI Trading Bot (Atlas)

## Gambaran Besar

Bot trading XAUUSD otonom yang:
1. Mengambil data candle real-time dari Deriv WebSocket API (5 timeframe: M5/M15/H1/H4/D1)
2. Menghitung **semua varian** 13+ indikator teknikal multi-timeframe — AI bebas pilih mana yang relevan
3. Menginjek long-term memory + short-term memory + kalender ekonomi + data pasar ke LLM
4. LLM (qwen3.7-max via custom endpoint) memutuskan BUY/SELL/WAIT dan **memilih sendiri** indikator yang ia andalkan
5. Jika BUY/SELL lolos session-aware threshold (confidence + confluence + R:R ≥ 1.5) → kirim sinyal ke Telegram, masuk mode MONITORING
6. Monitor harga real-time tiap 10 detik → kirim WIN/LOSS ketika TP/SL tercapai → kembali ANALYZING

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
| AI | Custom LLM endpoint (qwen3.7-max via `qwn-api`) |
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
│                          callAI(), analyzeMarket(), analyzeMarketOnDemand(),
│                          buildSensoryDataWithMeta(), buildMemoryContext(),
│                          validateSignal(), validateSignalGeometry()
├── indicators.ts        ← Semua varian indikator teknikal — AI bebas pilih mana yang relevan
│                          (EMA 8/13/20/21/34/50/89/100/200, RSI 7/9/14/21, MACD std+fast,
│                           BB 2σ+1σ, ATR 7/14/21, Stoch std+fast, Ichimoku, Fib, WR, CCI 14/20)
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

## Desain Indikator — AI Memilih Sendiri

Semua varian indikator **dihitung semuanya** dan dikirim ke AI. AI tidak dipaksa pakai satu set tetap — ia memilih kombinasi yang paling relevan sesuai kondisi pasar saat itu, dan wajib menyebutkan alasannya di field `reasoning`.

| Kelompok | Varian Tersedia | Panduan AI |
|---|---|---|
| **EMA** | 8, 13, 20, 21, 34, 50, 89, 100, 200 | Pilih 2–3 yang paling banyak diuji harga |
| **RSI** | 7, 9, 14, 21 | RSI-7/9 cepat; RSI-21 filter tren |
| **MACD** | Standar (12,26,9) + Fast (5,13,4) | Fast untuk M5/M15; Standar untuk H1/H4 |
| **Bollinger Bands** | 2σ outer + 1σ inner | 2σ extreme; 1σ mean-reversion |
| **ATR** | 7, 14, 21 | ATR-7 scalp; ATR-14 default; ATR-21 swing SL |
| **Stochastic** | Standar (14,3,3) + Fast (5,3,3) | Fast entry timing; Standar konfirmasi |
| **CCI** | 14 + 20 | CCI-14 sensitif; CCI-20 smooth |
| **Ichimoku** | Standard | Bias tren menengah + S/R dinamis |
| **Fibonacci** | 50-candle lookback | Golden zone 38.2%–61.8% |
| **Williams %R** | 14 | Konfirmasi jenuh beli/jual |
| **Raw OHLCV** | 20 candle terakhir | Price action langsung dari chart |

---

## Dua System Prompt (AI)

| | `SYSTEM_PROMPT` | `CHAT_SYSTEM_PROMPT` |
|---|---|---|
| Digunakan oleh | `analyzeMarket()` (cron) | `analyzeMarketOnDemand()` (/chat) |
| Filosofi | "Temukan setup dengan dasar teknikal" | "Selalu beri arah BUY atau SELL" |
| Hard WAIT rules | Ya (conf < 0.50, confluence < 4, R:R < 1.5) | Tidak |
| Setup types | IMMEDIATE_ENTRY, NO_SETUP | IMMEDIATE_ENTRY, PENDING_SETUP |
| PENDING_SETUP | Tidak digunakan | Digunakan ketika kondisi belum ideal |
| Prices wajib | Hanya jika BUY/SELL | Selalu wajib (entry/TP/SL tidak boleh null) |

---

## Session-Aware Thresholds

Threshold sinyal berubah sesuai sesi trading aktif:

| Sesi | Jam UTC | Jam WIB | Confidence Min | Confluence Min |
|---|---|---|---|---|
| Asia | 22:00–07:59 | 05:00–14:59 | 0.58 | 4 |
| London/NY | 08:00–11:59 / 16:00–21:59 | 15:00–18:59 / 23:00–04:59 | 0.55 | 4 |
| London+NY Overlap | 12:00–15:59 | 19:00–22:59 | 0.53 | 4 |

R:R minimum **1.5** berlaku di semua sesi.

---

## Shared Libraries (`lib/`)

### `@workspace/api-spec`
- File: `lib/api-spec/openapi.yaml`
- Source of truth untuk semua API contracts
- Jangan ubah `info.title` — mengontrol nama file generated

### `@workspace/api-zod`
- Auto-generated dari OpenAPI spec
- Berisi Zod schemas untuk request/response validation
- Regenerate: `pnpm --filter @workspace/api-spec run codegen`

### `@workspace/api-client-react`
- Auto-generated React Query hooks
- Dashboard menggunakannya: `useGetBotStatus()`, `useGetSignals()`, dll

### `@workspace/db`
- Drizzle ORM config
- Butuh `DATABASE_URL` env var — jika tidak di-set, throw on import
- Saat ini tidak aktif digunakan oleh bot

---

## Environment Variables

| Variable | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token dari @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Chat ID tujuan sinyal |
| `AI_API_KEY` | ✅ | Bearer key untuk custom LLM endpoint |
| `AI_API_URL` | ❌ | Default: `https://qwn-api--miok1qpgd.replit.app/v1/chat/completions` |
| `AI_MODEL` | ❌ | Default: `qwen3.7-max` |
| `SESSION_SECRET` | ❌ | Untuk session middleware (opsional) |
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
- **Health path production**: `/api/healthz` (dikonfigurasi di `artifact.toml`)
- **Persistent data**: `data/memory.json`, `data/long_term_notes.json` — tidak hilang saat restart
