import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const LTM_FILE = join(DATA_DIR, "long_term_notes.json");

export const MAX_LT_NOTES = 10;

export interface LongTermNote {
  id: string;
  content: string;
  createdAt: string;
  lastReaffirmed: string;
}

export type LTMOp =
  | { op: "ADD"; content: string }
  | { op: "UPDATE"; id: string; content: string }
  | { op: "DELETE"; id: string };

let notes: LongTermNote[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!existsSync(LTM_FILE)) return;
    const raw = JSON.parse(readFileSync(LTM_FILE, "utf-8")) as { notes: LongTermNote[] };
    if (Array.isArray(raw.notes)) {
      notes = raw.notes.slice(0, MAX_LT_NOTES);
      logger.info({ count: notes.length }, "Long-term memory loaded from disk");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load long-term memory — starting fresh");
  }
}

function saveToDisk(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      LTM_FILE,
      JSON.stringify({ notes, savedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
  } catch (err) {
    logger.error({ err }, "Failed to save long-term memory to disk");
  }
}

export function getLongTermNotes(): LongTermNote[] {
  ensureLoaded();
  return notes;
}

export function applyLTMOps(ops: LTMOp[]): void {
  ensureLoaded();
  if (!ops || ops.length === 0) return;

  let changed = false;

  for (const op of ops) {
    if (op.op === "ADD" && op.content?.trim()) {
      if (notes.length >= MAX_LT_NOTES) {
        logger.warn(
          { count: notes.length },
          "Long-term memory at capacity — DELETE dulu sebelum ADD baru"
        );
        continue;
      }
      notes.push({
        id: randomUUID(),
        content: op.content.trim(),
        createdAt: new Date().toISOString(),
        lastReaffirmed: new Date().toISOString(),
      });
      logger.info({ content: op.content.slice(0, 60) }, "Long-term note added");
      changed = true;
    } else if (op.op === "DELETE" && op.id) {
      const before = notes.length;
      notes = notes.filter((n) => n.id !== op.id);
      if (notes.length < before) {
        logger.info({ id: op.id }, "Long-term note deleted");
        changed = true;
      }
    } else if (op.op === "UPDATE" && op.id && op.content?.trim()) {
      const note = notes.find((n) => n.id === op.id);
      if (note) {
        note.content = op.content.trim();
        note.lastReaffirmed = new Date().toISOString();
        logger.info({ id: op.id }, "Long-term note updated");
        changed = true;
      }
    }
  }

  if (changed) saveToDisk();
}
