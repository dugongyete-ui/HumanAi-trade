# ARCHITECTURE — XAUUSD AI Trading Bot (Atlas)

## Gambaran Besar

Bot trading XAUUSD otonom yang:
1. Mengambil data candle real-time dari Deriv WebSocket API
2. Menghitung 10+ indikator teknikal multi-timeframe (M5/M15/H1/H4)
3. Menginjek memori siklus lalu + kalender ekonomi + data pasar ke LLM
4. LLM (qwen3.7-max via custom endpoint) memutuskan BUY/SELL/WAIT
5. Jika BUY/SELL dengan confidence ≥60% → kirim sinyal ke Telegram, masuk mode MONITORING
6. Monitor harga real-time tiap 10 detik → kirim WIN/LOSS ketika TP/SL tercapai → kembali ANALYZING

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
| Build | esbuild (CJS bundle ke `dist/index.mjs`) |
| Logger | Pino (structured JSON logs) |
| Kalender | ForexFactory public JSON feed (gratis, tanpa API key) |
| MCP Server | Python `mcp` package (time & forex session awareness) |

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

## Deployment

- **Development**: `pnpm --filter @workspace/api-server run dev`
- **Production**: Deploy via Replit → domain `*.replit.app`
- **Keep alive (free tier)**: UptimeRobot ping `/api/healthz` setiap 5 menit
- **Health path production**: `/api/healthz` (dikonfigurasi di `artifact.toml`)
