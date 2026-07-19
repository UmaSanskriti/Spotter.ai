import fs from "node:fs";
import path from "node:path";
import type { Store } from "../db/store.js";
import type { HostAdapter, NormalizedTask } from "./types.js";
import { claudeCodeAdapter } from "./claudeCode.js";
import { geminiAdapter } from "./gemini.js";
import { codexAdapter } from "./codex.js";
import { recordDelegation } from "../core/ledger.js";
import { recomputeCharter } from "../core/charter.js";

export const ADAPTERS: HostAdapter[] = [claudeCodeAdapter, geminiAdapter, codexAdapter];

export interface IngestSummary {
  bySource: Record<string, { files: number; tasks: number; recorded: number; validated: boolean }>;
  totalRecorded: number;
}

/** Walk a directory tree collecting files an adapter can parse. */
function collectFiles(root: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  }
  return out;
}

const EXTS_FOR: Record<string, string[]> = {
  "claude-code": [".jsonl"],
  "gemini-cli": [".json"],
  "codex-cli": [".jsonl"],
};

export interface IngestOptions {
  /** Extra explicit roots (e.g. fixtures) keyed by adapter id. */
  extraRoots?: Partial<Record<string, string[]>>;
  /** Only run these adapter ids. */
  only?: string[];
  /** Skip each adapter's default on-disk roots (ingest only extraRoots). */
  skipDefaultRoots?: boolean;
  onProgress?: (msg: string) => void;
}

export function ingestAll(store: Store, opts: IngestOptions = {}): IngestSummary {
  const summary: IngestSummary = { bySource: {}, totalRecorded: 0 };
  const log = opts.onProgress ?? (() => {});

  for (const adapter of ADAPTERS) {
    if (opts.only && !opts.only.includes(adapter.id)) continue;
    const roots = [
      ...(opts.skipDefaultRoots ? [] : adapter.defaultRoots),
      ...(opts.extraRoots?.[adapter.id] ?? []),
    ];
    const exts = EXTS_FOR[adapter.id] ?? [".jsonl", ".json"];
    const files = roots.flatMap((r) => collectFiles(r, exts));
    let taskCount = 0;
    let recorded = 0;

    for (const file of files) {
      let contents: string;
      try {
        contents = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      let tasks: NormalizedTask[] = [];
      try {
        tasks = adapter.parseFile(file, contents);
      } catch (err) {
        log(`  ! ${adapter.label}: failed to parse ${path.basename(file)} (${(err as Error).message})`);
        continue;
      }
      taskCount += tasks.length;
      for (const t of tasks) {
        const res = recordDelegation(store, {
          source: t.source,
          description: t.description,
          detail: t.detail,
          sessionId: t.sessionId,
          ts: t.ts,
          fingerprint: t.fingerprint,
        });
        if (res.recorded) recorded++;
      }
    }

    summary.bySource[adapter.id] = {
      files: files.length,
      tasks: taskCount,
      recorded,
      validated: adapter.validatedOnThisMachine,
    };
    summary.totalRecorded += recorded;
    const flag = adapter.validatedOnThisMachine ? "" : " (⚠ unvalidated format)";
    log(`  ${adapter.label}: ${files.length} files, ${recorded} new tasks${flag}`);
  }

  // Recompute the charter after any ingest so status/ranking stays current.
  recomputeCharter(store);
  return summary;
}
