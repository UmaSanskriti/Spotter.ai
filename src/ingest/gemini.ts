import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { HostAdapter, NormalizedTask } from "./types.js";
import { looksLikeTask } from "./types.js";

/**
 * Gemini CLI adapter — Google's coding CLI (hackathon sponsor).
 *
 * ⚠️ NOT validated on this machine: Gemini CLI is not installed here (`~/.gemini`
 * absent). Built against the documented on-disk formats; ships with a fixture
 * (corpus/fixtures/gemini-logs.json) so the pipeline is exercised end-to-end.
 * Confirm field names against a live install before shipping (spotter.md §13).
 *
 * Two persistence shapes are supported:
 *  1. Prompt log:  ~/.gemini/tmp/<projectHash>/logs.json
 *     -> array of { sessionId, messageId, type:'user'|..., message, timestamp }
 *  2. Chat checkpoints: ~/.gemini/tmp/<projectHash>/checkpoint-<tag>.json
 *     -> Gemini Content[]: { role:'user'|'model', parts:[{text}] }
 */
export const geminiAdapter: HostAdapter = {
  id: "gemini-cli",
  label: "Gemini CLI",
  defaultRoots: [path.join(os.homedir(), ".gemini", "tmp")],
  validatedOnThisMachine: false,
  parseFile(filePath, contents) {
    let data: any;
    try {
      data = JSON.parse(contents);
    } catch {
      return [];
    }
    const base = path.basename(filePath).toLowerCase();
    if (Array.isArray(data)) {
      if (base.startsWith("checkpoint") || (data[0] && "parts" in data[0])) {
        return fromCheckpoint(filePath, data);
      }
      return fromLogs(filePath, data);
    }
    // some versions wrap history under a key
    if (Array.isArray(data?.history)) return fromCheckpoint(filePath, data.history);
    if (Array.isArray(data?.logs)) return fromLogs(filePath, data.logs);
    return [];
  },
};

function fromLogs(filePath: string, entries: any[]): NormalizedTask[] {
  const tasks: NormalizedTask[] = [];
  for (const e of entries) {
    if (e?.type && e.type !== "user") continue;
    const text = typeof e?.message === "string" ? e.message : "";
    if (!text || !looksLikeTask(text)) continue;
    const ts = e?.timestamp ? Date.parse(e.timestamp) : Date.now();
    tasks.push({
      source: "gemini-cli",
      description: text,
      detail: null,
      sessionId: e?.sessionId ?? path.basename(path.dirname(filePath)),
      ts: Number.isNaN(ts) ? Date.now() : ts,
      fingerprint:
        "gm:" +
        (e?.sessionId && e?.messageId != null
          ? `${e.sessionId}:${e.messageId}`
          : crypto.createHash("sha1").update(`${filePath}:${text}`).digest("hex").slice(0, 16)),
    });
  }
  return tasks;
}

function fromCheckpoint(filePath: string, history: any[]): NormalizedTask[] {
  const tasks: NormalizedTask[] = [];
  let pendingModel = "";
  let last: NormalizedTask | null = null;
  history.forEach((turn: any, i: number) => {
    const role = turn?.role;
    const text = Array.isArray(turn?.parts)
      ? turn.parts.map((p: any) => p?.text).filter(Boolean).join("\n")
      : "";
    if (role === "user" && text && looksLikeTask(text)) {
      if (last && pendingModel) last.detail = pendingModel.slice(0, 4000);
      pendingModel = "";
      last = {
        source: "gemini-cli",
        description: text,
        detail: null,
        sessionId: path.basename(path.dirname(filePath)),
        ts: Date.now() - (history.length - i) * 60_000, // synthetic ordering when no ts
        fingerprint:
          "gm:" + crypto.createHash("sha1").update(`${filePath}:${i}:${text}`).digest("hex").slice(0, 16),
      };
      tasks.push(last);
    } else if (role === "model" && text) {
      pendingModel += (pendingModel ? "\n" : "") + text;
    }
  });
  if (last && pendingModel) (last as NormalizedTask).detail = pendingModel.slice(0, 4000);
  return tasks;
}
