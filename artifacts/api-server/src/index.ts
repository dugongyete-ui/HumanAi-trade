import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initTelegram, registerCommands } from "./lib/telegram.js";
import { startBot, pauseBot, resumeBot, runAnalysis, getBotStatus } from "./lib/scheduler.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const telegramBot = initTelegram();
  if (telegramBot) {
    registerCommands(
      () => runAnalysis(),
      () => getBotStatus(),
      () => pauseBot(),
      () => resumeBot()
    );
    logger.info("Telegram commands registered");
  }

  startBot();
  logger.info("XAUUSD AI Trading Bot started");
});
