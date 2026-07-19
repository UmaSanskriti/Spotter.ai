import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Store } from "../db/store.js";
import type { PracticeDirective, Skill } from "./types.js";
import { tag } from "./tagger.js";
import { currentRetention } from "./scheduler.js";
import { watchlist } from "./charter.js";
import { DEFAULT_DAILY_PROBE_BUDGET } from "../config.js";

/**
 * Turns a task context into a PracticeDirective — plain-language instructions any
 * agent can execute (spotter.md §6). This is Loop 2's decision point (§5): pick
 * {skill, surface} to weave a rep into the deliverable, honoring the hard budget
 * (§4.4) and the interruptibility rules. A real contextual bandit would replace
 * `chooseSurface`; the current policy is retention-tiered + round-robin (a
 * deterministic stand-in the Reflector can later tune).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PED_PATH = firstExisting([
  path.join(__dirname, "../../data/pedagogy.json"),
  path.join(__dirname, "../data/pedagogy.json"),
]);

interface SurfaceDef {
  mechanic: string;
  instruction: string;
  probe: string;
  minRetention: number;
}
interface Pedagogy {
  surfaces: Record<string, SurfaceDef>;
}
const pedagogy: Pedagogy = JSON.parse(fs.readFileSync(PED_PATH, "utf8"));

export function localDay(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DirectiveOptions {
  dailyBudget?: number;
  /** If false, returns surface:"none" once budget is spent (default true). */
  respectBudget?: boolean;
}

export function getPracticeDirective(
  store: Store,
  taskContext: string,
  opts: DirectiveOptions = {}
): PracticeDirective {
  const now = Date.now();
  const dailyBudget = opts.dailyBudget ?? Number(store.getMeta("dailyBudget") ?? DEFAULT_DAILY_PROBE_BUDGET);
  const respectBudget = opts.respectBudget ?? true;
  const day = localDay(now);
  const used = store.probesToday(day);
  const budgetRemaining = Math.max(0, dailyBudget - used);

  // Which skill does this task touch, and is it worth a rep?
  const tagged = tag(taskContext);
  const wl = watchlist(store);
  const skill = pickSkill(store, tagged?.skillId, wl, now);

  if (!skill) {
    return none("No chartered skill matches this task — nothing to practice.", budgetRemaining);
  }
  if (respectBudget && budgetRemaining <= 0) {
    return none(
      `Daily probe budget (${dailyBudget}) already spent — staying silent (spotter.md §4.4).`,
      0,
      skill
    );
  }
  if (skill.status === "letgo" || skill.status === "ignore") {
    return none(`'${skill.label}' is 📦 let-go — not practiced by design.`, budgetRemaining, skill);
  }

  const card = store.getCard(skill.id);
  const retention = card && card.reps > 0 ? currentRetention(card, now) : 0.5;

  const surfaceKey = chooseSurface(retention, store.eventsForSkill(skill.id, "practice").length);
  const def = pedagogy.surfaces[surfaceKey];

  const instruction = def.instruction.replace(/\{skill\}/g, skill.label);
  const probe = def.probe.replace(/\{skill\}/g, skill.label);

  // Reserve the budget slot the moment we hand out a directive.
  if (respectBudget) store.logProbe(day, skill.id, surfaceKey);

  return {
    skillId: skill.id,
    skillLabel: skill.label,
    surface: surfaceKey as PracticeDirective["surface"],
    instruction,
    probe,
    // Reference is filled by the agent's own solution at grade time; we seed a hint.
    reference: undefined,
    rationale:
      `Skill '${skill.label}' is ${statusEmoji(skill.status)} (protection ${skill.protectionScore.toFixed(2)}, ` +
      `retention ${Math.round(retention * 100)}%). Surface '${surfaceKey}' — ${def.mechanic}.`,
    budgetRemaining: respectBudget ? budgetRemaining - 1 : budgetRemaining,
  };
}

/** Prefer the task's tagged skill if chartered; else the most-decayed watchlist skill. */
function pickSkill(store: Store, taggedId: string | undefined, wl: Skill[], now: number): Skill | undefined {
  if (taggedId) {
    const s = store.getSkill(taggedId);
    if (s && (s.status === "protect" || s.status === "watch" || s.userOverride)) return s;
  }
  // Fall back to the watchlist skill with the lowest current retention (most due).
  let best: { s: Skill; r: number } | undefined;
  for (const s of wl) {
    const c = store.getCard(s.id);
    const r = c && c.reps > 0 ? currentRetention(c, now) : 0.5;
    if (!best || r < best.r) best = { s, r };
  }
  return best?.s;
}

/**
 * Retention-tiered surface choice (placeholder for the Thompson-sampling bandit,
 * spotter.md §5 Loop 2). Low retention -> low-effort generative surfaces; high
 * retention -> harder discrimination/teach-back surfaces (ZPD staircase, §3 #2).
 */
function chooseSurface(retention: number, priorReps: number): string {
  if (retention < 0.4) return priorReps === 0 ? "gap" : "predict-reveal";
  if (retention < 0.55) return "endgame";
  // rotate the harder surfaces to interleave (§3 #5)
  return priorReps % 2 === 0 ? "teachback" : "ship-a-or-b";
}

function none(rationale: string, budgetRemaining: number, skill?: Skill): PracticeDirective {
  return {
    skillId: skill?.id ?? null,
    skillLabel: skill?.label ?? null,
    surface: "none",
    instruction: "Proceed normally — no practice directive this time.",
    rationale,
    budgetRemaining,
  };
}

function statusEmoji(s: string): string {
  return s === "protect" ? "🔒 protect" : s === "watch" ? "👁 watch" : s === "letgo" ? "📦 let-go" : s;
}

function firstExisting(paths: string[]): string {
  for (const p of paths) if (fs.existsSync(p)) return p;
  return paths[0];
}
