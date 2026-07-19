import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Store } from "../db/store.js";
import { ingestAll } from "./runner.js";
import { recordPractice } from "../core/ledger.js";
import { recomputeCharter } from "../core/charter.js";

/**
 * Replay corpus (spotter.md §7, hours 0-1): a realistic multi-agent, multi-week
 * delegation history for a founder-engineer persona. Emits fixtures in EACH host's
 * real on-disk format, then ingests them through the actual adapters — so the demo's
 * "same ledger ticks from Claude Code AND Gemini AND Codex" money-shot is genuine,
 * not mocked. Finally injects a few practice reps so retention curves are non-trivial.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../../corpus/fixtures");

const DAY = 86_400_000;

// Task templates per skill; each will be attributed to one of the three agents.
const TASKS: Record<string, string[]> = {
  "sql-analytics": [
    "write a SQL query to get weekly active users by cohort",
    "optimize this slow postgres query with a window function",
    "join orders and customers and group by month for revenue",
    "debug why this SQL aggregate returns duplicate rows",
    "add a CTE to compute retention curves from the events table",
    "write a query for month-over-month growth by segment",
  ],
  debugging: [
    "fix the bug where the worker crashes on null payloads",
    "debug this race condition in the queue consumer",
    "why does the auth middleware throw an exception on refresh tokens",
    "reproduce and fix the flaky checkout test",
    "trace this stack trace and fix the segfault in the parser",
  ],
  "persuasive-writing": [
    "draft the monthly investor update email",
    "write a persuasive cold email to a potential design partner",
    "draft an investor update on our runway and growth",
    "rewrite this pitch paragraph to be more convincing",
  ],
  "system-design": [
    "design a system for real-time notifications with a queue",
    "should we use a cron or an event-driven approach here, design it",
    "sketch the architecture tradeoffs for sharding the users table",
  ],
  "code-review": [
    "review this PR and read the diff for correctness",
    "code review: refactor the payments module",
  ],
  "financial-modeling": [
    "build a financial model for our runway and burn rate",
    "forecast cash flow for the next 12 months",
  ],
};

// Which agent "did" each skill's tasks — spread across all three to prove cross-agent.
const AGENT_FOR: Record<string, "claude" | "gemini" | "codex"> = {
  "sql-analytics": "claude",
  debugging: "claude",
  "persuasive-writing": "gemini",
  "system-design": "codex",
  "code-review": "gemini",
  "financial-modeling": "codex",
};

interface Gen {
  claudeLines: string[];
  geminiLogs: any[];
  codexLines: string[];
}

function generateFixtures(now: number): Gen {
  const g: Gen = { claudeLines: [], geminiLogs: [], codexLines: [] };
  let msgId = 0;

  // Spread ~34 delegated tasks across the last 60 days.
  const entries: Array<{ skill: string; text: string; ts: number }> = [];
  let dayOffset = 58;
  for (const [skill, texts] of Object.entries(TASKS)) {
    for (const text of texts) {
      const ts = now - dayOffset * DAY - Math.floor(Math.random() * DAY);
      entries.push({ skill, text, ts });
      dayOffset -= 1.6;
      if (dayOffset < 1) dayOffset = 58;
    }
  }
  entries.sort((a, b) => a.ts - b.ts);

  for (const e of entries) {
    const agent = AGENT_FOR[e.skill];
    const iso = new Date(e.ts).toISOString();
    if (agent === "claude") {
      const uuid = `seed-${msgId}`;
      g.claudeLines.push(
        JSON.stringify({
          type: "user",
          uuid,
          sessionId: "cc-demo-session",
          timestamp: iso,
          message: { role: "user", content: e.text },
        })
      );
      g.claudeLines.push(
        JSON.stringify({
          type: "assistant",
          sessionId: "cc-demo-session",
          timestamp: iso,
          message: { role: "assistant", content: [{ type: "text", text: "Done — here's the solution." }] },
        })
      );
    } else if (agent === "gemini") {
      g.geminiLogs.push({
        sessionId: "gm-demo-session",
        messageId: msgId,
        type: "user",
        message: e.text,
        timestamp: iso,
      });
    } else {
      g.codexLines.push(
        JSON.stringify({
          timestamp: iso,
          type: "response_item",
          payload: { type: "message", role: "user", content: [{ type: "input_text", text: e.text }] },
        })
      );
    }
    msgId++;
  }
  return g;
}

export interface SeedResult {
  ingested: number;
  practiceReps: number;
}

export function seed(store: Store, opts: { now?: number } = {}): SeedResult {
  const now = opts.now ?? Date.now();
  const g = generateFixtures(now);

  // Write fixtures in each host's real format.
  const ccDir = path.join(FIXTURE_DIR, "claude-code");
  fs.mkdirSync(ccDir, { recursive: true });
  fs.writeFileSync(path.join(ccDir, "cc-demo-session.jsonl"), g.claudeLines.join("\n"));
  fs.mkdirSync(path.join(FIXTURE_DIR, "gemini", "gm-demo-session"), { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "gemini", "gm-demo-session", "logs.json"),
    JSON.stringify(g.geminiLogs, null, 2)
  );
  const cxDir = path.join(FIXTURE_DIR, "codex", "2026", "06", "01");
  fs.mkdirSync(cxDir, { recursive: true });
  fs.writeFileSync(path.join(cxDir, "rollout-1717200000-demo.jsonl"), g.codexLines.join("\n"));

  // Ingest through the REAL adapters, pointing them at the fixture dirs.
  const summary = ingestAll(store, {
    skipDefaultRoots: true, // deterministic: fixtures only, not the user's real transcripts
    extraRoots: {
      "claude-code": [ccDir],
      "gemini-cli": [path.join(FIXTURE_DIR, "gemini")],
      "codex-cli": [path.join(FIXTURE_DIR, "codex")],
    },
  });

  // Inject practice reps so a few skills have real curves + calibration.
  // Debugging: practiced a couple times (kept sharp-ish). SQL: barely practiced (decaying).
  let reps = 0;
  const practicePlan: Array<{ skill: string; grade: number; conf: number; daysAgo: number }> = [
    { skill: "debugging", grade: 3, conf: 0.7, daysAgo: 20 },
    { skill: "debugging", grade: 4, conf: 0.8, daysAgo: 6 },
    { skill: "sql-analytics", grade: 2, conf: 0.9, daysAgo: 30 }, // confident miss -> hypercorrection
    { skill: "system-design", grade: 3, conf: 0.6, daysAgo: 10 },
  ];
  for (const p of practicePlan) {
    recordPractice(store, {
      source: "manual",
      skillId: p.skill,
      description: `practice rep for ${p.skill}`,
      answer: "user attempt",
      grade: p.grade,
      confidence: p.conf,
      ts: now - p.daysAgo * DAY,
    });
    reps++;
  }

  recomputeCharter(store, { roleId: "founder-engineer", trajectorySignal: "prepping for staff interviews" });
  return { ingested: summary.totalRecorded, practiceReps: reps };
}
