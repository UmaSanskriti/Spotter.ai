import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Store } from "../db/store.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { recordDelegation, recordPractice, ledgerSnapshot } from "../core/ledger.js";
import { getPracticeDirective } from "../core/directives.js";
import { grade } from "../core/grader.js";
import { buildMirror } from "../core/mirror.js";
import { recomputeCharter, watchlist } from "../core/charter.js";
import { currentRetention } from "../core/scheduler.js";
import type { SkillStatus, WhyChip } from "../core/types.js";

/**
 * Layer 2 — the in-loop MCP server (spotter.md §6). One brain, many mouths:
 * a single Store shared across every connected agent, so the ledger is unified
 * cross-agent. All tools here are the tool surface described in §6.
 */
export function buildMcpServer(store: Store): McpServer {
  const server = new McpServer(
    { name: "spotter", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  // ---- task_started -------------------------------------------------------
  server.registerTool(
    "task_started",
    {
      title: "Report a task the user delegated",
      description:
        "Call at the START of a non-trivial task the user delegated. Records the delegation " +
        "(decay signal) and returns the tagged skill plus a taskId to pass to task_completed.",
      inputSchema: {
        description: z.string().describe("Short description of the task the user asked you to do"),
        session_id: z.string().optional().describe("Your session/conversation id, if available"),
      },
    },
    async ({ description, session_id }) => {
      const res = recordDelegation(store, { source: "mcp", description, sessionId: session_id });
      return ok({
        taskId: res.eventId,
        skill: res.skillId,
        skillLabel: res.skillLabel,
        confidence: res.confidence,
        next: "Consider calling get_practice_directive with this description.",
      });
    }
  );

  // ---- task_completed -----------------------------------------------------
  server.registerTool(
    "task_completed",
    {
      title: "Report task completion with the solution",
      description:
        "Call when you FINISH a delegated task. Attaches your solution + reasoning to the " +
        "ledger. Pass the taskId from task_started; if omitted, a delegation event is recorded.",
      inputSchema: {
        solution: z.string().describe("The solution/deliverable you produced"),
        reasoning: z.string().optional().describe("One line: why this approach"),
        task_id: z.number().optional().describe("The taskId returned by task_started"),
        description: z.string().optional().describe("Task description (needed if no task_id)"),
        session_id: z.string().optional(),
      },
    },
    async ({ solution, reasoning, task_id, description, session_id }) => {
      const detail = reasoning ? `${reasoning}\n---\n${solution}` : solution;
      if (task_id != null && store.getEvent(task_id)) {
        store.updateEventDetail(task_id, detail);
        return ok({ updated: task_id });
      }
      const res = recordDelegation(store, {
        source: "mcp",
        description: description ?? solution.slice(0, 120),
        detail,
        sessionId: session_id,
      });
      return ok({ recorded: res.eventId, skill: res.skillId });
    }
  );

  // ---- get_practice_directive --------------------------------------------
  server.registerTool(
    "get_practice_directive",
    {
      title: "Get a practice directive to weave into the deliverable",
      description:
        "Returns plain-language instructions to fold ONE light practice rep into your work " +
        "(a TODO(you): gap, a predict-then-reveal, an endgame handoff, etc.), or surface:'none' " +
        "when the budget is spent or no chartered skill applies. Execute the instruction verbatim.",
      inputSchema: {
        task_context: z.string().describe("What you're about to do for the user"),
      },
    },
    async ({ task_context }) => {
      const d = getPracticeDirective(store, task_context);
      return ok(d);
    }
  );

  // ---- grade_attempt ------------------------------------------------------
  server.registerTool(
    "grade_attempt",
    {
      title: "Grade the user's practice attempt",
      description:
        "Reference-based grading of the user's answer to a probe. Pass the reference (your own " +
        "correct solution) so grading is comparison, not generation. Returns an FSRS grade, a " +
        "one-line delta to show the user immediately, and updates their forgetting curve.",
      inputSchema: {
        user_answer: z.string().describe("What the user said/wrote"),
        reference: z.string().optional().describe("Your correct solution to grade against"),
        skill_id: z.string().optional().describe("Skill being practiced (else inferred)"),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("User's stated confidence 0..1, for calibration scoring"),
      },
    },
    async ({ user_answer, reference, skill_id, confidence }) => {
      const result = grade(user_answer, reference ?? "");
      const rec = recordPractice(store, {
        source: "mcp",
        skillId: skill_id,
        description: reference ?? user_answer,
        answer: user_answer,
        grade: result.grade,
        confidence,
      });
      recomputeCharter(store);
      const card = rec.skillId ? store.getCard(rec.skillId) : undefined;
      return ok({
        grade: result.grade,
        score: result.score,
        correct: result.correct,
        delta: result.delta,
        skill: rec.skillId,
        newRetention: card ? Math.round(currentRetention(card, Date.now()) * 100) : null,
        newHalfLifeDays: card ? Number(card.halfLifeDays.toFixed(1)) : null,
      });
    }
  );

  // ---- get_skill_ledger ---------------------------------------------------
  server.registerTool(
    "get_skill_ledger",
    {
      title: "Get the full skill ledger",
      description:
        "Returns every tracked skill with status, retention %, half-life, calibration, and the " +
        "delegation Mirror headline. The watchlist (top skills by protection score) is flagged.",
      inputSchema: {},
    },
    async () => {
      const now = Date.now();
      const wl = new Set(watchlist(store).map((s) => s.id));
      const rows = ledgerSnapshot(store).map(({ skill, card }) => ({
        id: skill!.id,
        label: skill!.label,
        status: skill!.status,
        why: skill!.why,
        onWatchlist: wl.has(skill!.id),
        protectionScore: Number(skill!.protectionScore.toFixed(2)),
        delegationIntensity: Number(skill!.delegationIntensity.toFixed(2)),
        retentionPct: card && card.reps > 0 ? Math.round(currentRetention(card, now) * 100) : null,
        halfLifeDays: card ? Number(card.halfLifeDays.toFixed(1)) : null,
        brier: card ? Number(card.brier.toFixed(3)) : null,
        reps: card?.reps ?? 0,
      }));
      rows.sort((a, b) => b.protectionScore - a.protectionScore);
      return ok({ role: store.getMeta("role"), mirror: buildMirror(store).headline, skills: rows });
    }
  );

  // ---- get_delegation_mirror ---------------------------------------------
  server.registerTool(
    "get_delegation_mirror",
    {
      title: "Get the Delegation Mirror",
      description:
        "The 'Spotify Wrapped' view: how much of each skill the user has delegated across all " +
        "agents in the last N days, with estimated retention. Screenshot-ready headline included.",
      inputSchema: {
        window_days: z.number().optional().describe("Lookback window (default 60)"),
      },
    },
    async ({ window_days }) => ok(buildMirror(store, window_days ?? 60))
  );

  // ---- update_charter -----------------------------------------------------
  server.registerTool(
    "update_charter",
    {
      title: "Change what Spotter protects",
      description:
        "User-driven override of a skill's status. 'protect' (🔒) actively practices it; 'watch' " +
        "(👁) tracks only; 'letgo' (📦) stops practicing it, guilt-free. Overrides are absolute.",
      inputSchema: {
        skill_id: z.string(),
        action: z.enum(["protect", "watch", "letgo", "ignore"]),
        why: z.enum(["verification", "career", "trajectory", "chosen"]).optional(),
      },
    },
    async ({ skill_id, action, why }) => {
      if (!store.getSkill(skill_id)) {
        return ok({ error: `Unknown skill '${skill_id}'. Call get_skill_ledger for valid ids.` });
      }
      store.setSkillStatus(skill_id, action as SkillStatus, true);
      if (why) store.addWhy(skill_id, why as WhyChip);
      return ok({ skill: skill_id, status: action, override: true });
    }
  );

  return server;
}
