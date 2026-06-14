# XAUUSD AI Trading Bot

Bot Telegram AI otonom yang menganalisis pasar emas (XAUUSD) menggunakan multi-timeframe technical analysis dan LLM AI, lalu mengirimkan sinyal BUY/SELL ke Telegram secara otomatis setiap 15 menit.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/dashboard run dev` — run the dashboard (port 23183)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Data: Deriv WebSocket API (frxXAUUSD)
- AI: Custom LLM endpoint (qwen3.7-max via qwn-api)
- Telegram: node-telegram-bot-api (polling mode)
- Scheduler: node-cron (every 15 minutes)
- Frontend: React + Vite + shadcn/ui + Tailwind CSS
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/lib/deriv-client.ts` — Deriv WebSocket client, candle + tick fetching
- `artifacts/api-server/src/lib/indicators.ts` — Technical indicators (RSI, MACD, EMA, BB, ATR, Stochastic, patterns, market structure)
- `artifacts/api-server/src/lib/ai-agent.ts` — AI analysis, builds sensory data package, calls LLM
- `artifacts/api-server/src/lib/telegram.ts` — Telegram bot init, signal formatting, command handlers
- `artifacts/api-server/src/lib/signal-store.ts` — In-memory signal history (last 100 signals)
- `artifacts/api-server/src/lib/scheduler.ts` — Agentic loop (cron every 15 min), bot state
- `artifacts/dashboard/src/` — React dashboard (dark theme, gold accents)
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- **Market closed handling**: Deriv returns error when gold market is closed (weekends/holidays). Bot logs the error and retries on next scheduled cycle — this is expected behavior.
- **Confidence threshold**: Only signals with confidence >= 60% are sent to Telegram. WAIT decisions are never sent.
- **Multi-timeframe**: M5, M15, H1, H4 candles fetched simultaneously for holistic analysis.
- **In-memory signals**: Signal history kept in RAM (max 100). On server restart, history resets. No DB needed for MVP.
- **Polling mode**: Telegram bot uses polling (not webhook) — simpler for Replit deployment.

## Product

- Autonomous XAUUSD trading signal bot
- AI analyzes 4 timeframes of technical indicators + candlestick patterns
- Sends formatted BUY/SELL signals to Telegram with entry/TP/SL/reasoning
- Web dashboard for monitoring bot status, live price, signal history
- Telegram commands: /start, /analyze, /status, /pause, /resume

## User preferences

- AI provider: Custom endpoint https://qwn-api--miok1qpgd.replit.app/v1/chat/completions (model: qwen3.7-max)
- Language: Bahasa Indonesia for all user-facing content
- Secrets stored as env vars (not Replit secrets)

## Gotchas

- Gold market is closed weekends and some holidays — Deriv returns "This market is presently closed" error, which is NORMAL.
- `DATABASE_URL` is referenced in `@workspace/db` but not used by the bot — the db lib throws if no DATABASE_URL is set, but the api-server imports it through `@workspace/api-zod`. If this causes issues, DATABASE_URL can be provisioned via the database skill.
- node-telegram-bot-api polling requires the bot token to be valid. If Telegram errors appear, check TELEGRAM_BOT_TOKEN env var.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
