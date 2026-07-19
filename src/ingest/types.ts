import type { EventSource } from "../core/types.js";

/** A source-agnostic task extracted from a transcript, ready for the ledger. */
export interface NormalizedTask {
  source: EventSource;
  description: string; // what the user asked the agent to do (delegation)
  detail?: string | null; // agent's solution/reasoning, when available
  sessionId?: string | null;
  ts: number; // epoch ms
  fingerprint: string; // stable dedupe key
}

/** An adapter turns one transcript file into normalized delegation tasks. */
export interface HostAdapter {
  id: EventSource;
  label: string;
  /** Default on-disk glob roots to scan. */
  defaultRoots: string[];
  /** Parse one file's contents into tasks. */
  parseFile(filePath: string, contents: string): NormalizedTask[];
  /** Whether this adapter's format is validated against a real install here. */
  validatedOnThisMachine: boolean;
}

export function looksLikeTask(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  // skip slash-commands, pure tool-result envelopes, system reminders
  if (t.startsWith("/")) return false;
  if (t.startsWith("<") && t.includes(">")) return false;
  if (/^\[.*\]$/.test(t)) return false;
  return true;
}
