import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { HostAdapter, NormalizedTask } from "./types.js";
import { looksLikeTask } from "./types.js";

/**
 * Codex CLI adapter — OpenAI's coding CLI.
 *
 * ⚠️ Format present but UNVALIDATED live: `codex` is installed here but had not
 * written a session yet (`~/.codex/sessions` absent at build time). Built against
 * the documented rollout format; ships with a fixture (corpus/fixtures/
 * codex-rollout.jsonl). Confirm against a live session before shipping.
 *
 * Rollout files: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
 * Each line is a JSON record. Across versions user input appears as either:
 *   { type:'response_item', payload:{ type:'message', role:'user',
 *       content:[{type:'input_text', text}] } }
 * or the older { record_type:'event', ... } / a bare
 *   { role:'user', content:'...' }.
 * The parser sniffs all three defensively.
 */
export const codexAdapter: HostAdapter = {
  id: "codex-cli",
  label: "Codex CLI",
  defaultRoots: [path.join(os.homedir(), ".codex", "sessions")],
  validatedOnThisMachine: false,
  parseFile(filePath, contents) {
    const tasks: NormalizedTask[] = [];
    const sessionId = sessionIdFromName(filePath);
    let idx = 0;
    for (const line of contents.split("\n")) {
      idx++;
      const t = line.trim();
      if (!t) continue;
      let rec: any;
      try {
        rec = JSON.parse(t);
      } catch {
        continue;
      }
      const extracted = extractUser(rec);
      if (!extracted || !looksLikeTask(extracted.text)) continue;
      const ts = extracted.ts ?? tsFromName(filePath) ?? Date.now();
      tasks.push({
        source: "codex-cli",
        description: extracted.text,
        detail: null,
        sessionId,
        ts,
        fingerprint:
          "cx:" + crypto.createHash("sha1").update(`${sessionId}:${idx}:${extracted.text}`).digest("hex").slice(0, 16),
      });
    }
    return tasks;
  },
};

function extractUser(rec: any): { text: string; ts?: number } | null {
  const payload = rec?.payload ?? rec;
  // shape A/B: message with role user
  if (payload?.role === "user" || payload?.type === "message") {
    if (payload?.role && payload.role !== "user") return null;
    const text = flattenContent(payload?.content);
    if (text) return { text, ts: parseTs(rec?.timestamp ?? payload?.timestamp) };
  }
  // shape C: bare {role, content}
  if (rec?.role === "user" && typeof rec?.content === "string") {
    return { text: rec.content, ts: parseTs(rec?.timestamp) };
  }
  return null;
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === "string" ? c : c?.text))
      .filter((s: any) => typeof s === "string")
      .join("\n");
  }
  return "";
}

function parseTs(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function sessionIdFromName(filePath: string): string {
  const m = path.basename(filePath).match(/rollout-.*?-([0-9a-f-]{8,})/i);
  return m?.[1] ?? path.basename(filePath, ".jsonl");
}

function tsFromName(filePath: string): number | undefined {
  const m = path.basename(filePath).match(/rollout-(\d{10,})/);
  return m ? Number(m[1]) : undefined;
}
