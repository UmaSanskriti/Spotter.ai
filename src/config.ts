import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/** All Spotter state lives on-device (spotter.md §6 "everything stays on-device"). */
export const SPOTTER_HOME =
  process.env.SPOTTER_HOME || path.join(os.homedir(), ".spotter");

export const DB_PATH = process.env.SPOTTER_DB || path.join(SPOTTER_HOME, "spotter.db");

/** localhost-only MCP endpoint — the "one brain, many mouths" service (spotter.md §6). */
export const HTTP_HOST = process.env.SPOTTER_HOST || "127.0.0.1";
export const HTTP_PORT = Number(process.env.SPOTTER_PORT || 7777);
export const MCP_PATH = "/mcp";

/** Intervention budget — hard, user-set, sacred (spotter.md §4.4). */
export const DEFAULT_DAILY_PROBE_BUDGET = Number(process.env.SPOTTER_BUDGET || 2);

/** Only the top N±2 skills by protection score are ever surfaced (spotter.md §4.2.1). */
export const WATCHLIST_SIZE = Number(process.env.SPOTTER_WATCHLIST || 6);

export function ensureHome(): void {
  fs.mkdirSync(SPOTTER_HOME, { recursive: true });
}
