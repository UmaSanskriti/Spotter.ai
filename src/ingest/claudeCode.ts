import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { HostAdapter, NormalizedTask } from "./types.js";
import { looksLikeTask } from "./types.js";

/**
 * Claude Code adapter — VALIDATED against a live install on this machine.
 * Transcripts: ~/.claude/projects/<project-slug>/<session-uuid>.jsonl
 * Each line is a JSON record; user turns carry {type:'user', message:{role:'user',
 * content: string | block[]}, uuid, sessionId, timestamp}.
 *
 * NOTE: Claude Code also supports deterministic hooks (PreToolUse/PostToolUse/Stop).
 * The hooks snippet (see hooks/claude-code-settings.json) is the real-time path;
 * this transcript watcher is the backstop that also backfills history for the Mirror.
 */
export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  label: "Claude Code",
  defaultRoots: [path.join(os.homedir(), ".claude", "projects")],
  validatedOnThisMachine: true,
  parseFile(filePath, contents) {
    const tasks: NormalizedTask[] = [];
    const lines = contents.split("\n");
    let idx = 0;
    let pendingAssistantText = "";
    let lastUser: { task: NormalizedTask; blank: boolean } | null = null;

    for (const line of lines) {
      idx++;
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec: any;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const msg = rec?.message;
      if (rec?.type === "user" && msg?.role === "user") {
        // attach any assistant text collected since the previous user turn as detail
        if (lastUser && pendingAssistantText) {
          lastUser.task.detail = pendingAssistantText.slice(0, 4000);
        }
        pendingAssistantText = "";

        const text = extractText(msg.content);
        if (!text || !looksLikeTask(text)) {
          lastUser = null;
          continue;
        }
        const ts = rec.timestamp ? Date.parse(rec.timestamp) : Date.now();
        const fp =
          "cc:" +
          (rec.uuid ??
            crypto.createHash("sha1").update(`${filePath}:${idx}:${text}`).digest("hex").slice(0, 16));
        const task: NormalizedTask = {
          source: "claude-code",
          description: text,
          detail: null,
          sessionId: rec.sessionId ?? path.basename(filePath, ".jsonl"),
          ts: Number.isNaN(ts) ? Date.now() : ts,
          fingerprint: fp,
        };
        tasks.push(task);
        lastUser = { task, blank: false };
      } else if (rec?.type === "assistant" && msg?.role === "assistant") {
        const text = extractText(msg.content);
        if (text) pendingAssistantText += (pendingAssistantText ? "\n" : "") + text;
      }
    }
    if (lastUser && pendingAssistantText) lastUser.task.detail = pendingAssistantText.slice(0, 4000);
    return tasks;
  },
};

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n");
  }
  return "";
}
