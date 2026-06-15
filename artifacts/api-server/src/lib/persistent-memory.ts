import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const MEMORY_FILE = join(DATA_DIR, "memory.json");
const SAVE_DEBOUNCE_MS = 2_000;

export interface PersistedData {
  memory: unknown[];
  sessionStats: unknown;
  savedAt: string;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadPersistedMemory(): PersistedData | null {
  try {
    ensureDataDir();
    if (!existsSync(MEMORY_FILE)) return null;
    const raw = readFileSync(MEMORY_FILE, "utf-8");
    const data = JSON.parse(raw) as PersistedData;
    const entries = Array.isArray(data.memory) ? data.memory.length : 0;
    logger.info({ entries, savedAt: data.savedAt }, "AI memory loaded from disk");
    return data;
  } catch (err) {
    logger.warn({ err }, "Failed to load persisted memory — starting fresh");
    return null;
  }
}

export function saveMemoryToDisk(memory: unknown[], sessionStats: unknown): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      ensureDataDir();
      const data: PersistedData = {
        memory,
        sessionStats,
        savedAt: new Date().toISOString(),
      };
      writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      logger.error({ err }, "Failed to save memory to disk");
    }
  }, SAVE_DEBOUNCE_MS);
}
