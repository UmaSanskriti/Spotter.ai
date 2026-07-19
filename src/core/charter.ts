import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Store } from "../db/store.js";
import type { Skill, SkillStatus, WhyChip } from "./types.js";
import { WATCHLIST_SIZE } from "../config.js";

/**
 * The auto-charter (spotter.md §4.2 & §4.2.1): zero questionnaires.
 *  1. Infer the user's role from available local signals.
 *  2. Map each emergent skill to its nearest canonical O*NET skill for an
 *     importance PRIOR (never the list).
 *  3. Cross importance x delegation-intensity -> status matrix.
 *  4. Rank by protection score; surface only the top N±2.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// data/ sits next to src/ in dev and next to dist/ after build.
const ONET_PATH = firstExisting([
  path.join(__dirname, "../../data/onet-profiles.json"),
  path.join(__dirname, "../data/onet-profiles.json"),
]);

interface OnetData {
  roles: Record<
    string,
    { label: string; signals: string[]; skills: Record<string, number> }
  >;
  canonicalSkills: Record<string, { label: string; why: WhyChip[] }>;
}

const onet: OnetData = JSON.parse(fs.readFileSync(ONET_PATH, "utf8"));

export interface RoleInference {
  roleId: string;
  label: string;
  confidence: number;
}

/** Infer role from any local text signal: resume, repo langs, transcript corpus. */
export function inferRole(signalText: string): RoleInference {
  const text = signalText.toLowerCase();
  let best: RoleInference = { roleId: "software-engineer", label: "Software Engineer", confidence: 0.3 };
  let bestHits = 0;
  for (const [roleId, role] of Object.entries(onet.roles)) {
    let hits = 0;
    for (const sig of role.signals) if (text.includes(sig.toLowerCase())) hits++;
    if (hits > bestHits) {
      bestHits = hits;
      best = { roleId, label: role.label, confidence: Math.min(0.95, 0.4 + 0.12 * hits) };
    }
  }
  return best;
}

export function roleImportance(roleId: string, skillId: string): number {
  return onet.roles[roleId]?.skills[skillId] ?? 0.3; // unknown skills get a mild prior
}

export function canonicalWhy(skillId: string): WhyChip[] {
  return onet.canonicalSkills[skillId]?.why ?? [];
}

/**
 * (Re)compute the whole charter from the event log. Idempotent: safe to run
 * after every ingest. `trajectorySignal` lets stated goals up-weight target-role
 * skills (spotter.md §4.2.1 "Trajectory").
 */
export function recomputeCharter(
  store: Store,
  opts: { roleId?: string; trajectorySignal?: string } = {}
): { role: RoleInference; skills: Skill[] } {
  const now = Date.now();
  const events = store.allEvents();

  // Infer role from corpus if not pinned.
  const corpus = events.map((e) => e.description).join(" \n ");
  const role = opts.roleId
    ? { roleId: opts.roleId, label: onet.roles[opts.roleId]?.label ?? opts.roleId, confidence: 1 }
    : inferRole(corpus);
  store.setMeta("role", role);

  // Delegation intensity per skill = delegated / (delegated + practiced).
  const del = new Map<string, number>();
  const prac = new Map<string, number>();
  for (const e of events) {
    if (!e.skillId) continue;
    const m = e.kind === "delegation" ? del : prac;
    m.set(e.skillId, (m.get(e.skillId) ?? 0) + 1);
  }

  const trajectory = (opts.trajectorySignal ?? (store.getMeta<string>("trajectory") ?? "")).toLowerCase();
  const skillIds = new Set<string>([...del.keys(), ...prac.keys()]);

  const results: Skill[] = [];
  for (const skillId of skillIds) {
    const d = del.get(skillId) ?? 0;
    const p = prac.get(skillId) ?? 0;
    const total = d + p;
    const delegationIntensity = total > 0 ? d / total : 0;

    const importance = roleImportance(role.roleId, skillId);
    const trajBoost = trajectory && trajectory.includes(skillId.replace(/-/g, " ")) ? 0.25 : 0;

    // consequence-of-error proxy: verification-chip skills are costly to get wrong.
    const why = canonicalWhy(skillId);
    const consequence = why.includes("verification") ? 0.2 : 0.05;

    // protection score (spotter.md §4.2.1): importance + trajectory + delegation + consequence.
    const protectionScore =
      0.4 * importance + 0.25 * Math.min(1, importance + trajBoost) + 0.25 * delegationIntensity + consequence;

    const status = classify(importance + trajBoost, delegationIntensity);
    const label =
      onet.canonicalSkills[skillId]?.label ??
      skillId.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

    const existing = store.getSkill(skillId);
    // User overrides are absolute in both directions (spotter.md §4.2.1).
    if (existing?.userOverride) {
      results.push({ ...existing, importance, delegationIntensity, protectionScore });
      store.upsertSkill({ ...existing, importance, delegationIntensity, protectionScore });
      continue;
    }

    const skill: Skill = {
      id: skillId,
      label,
      status,
      why: [...new Set([...(existing?.why ?? []), ...why])],
      importance,
      delegationIntensity,
      protectionScore,
      userOverride: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    store.upsertSkill(skill);
    results.push(skill);
  }

  results.sort((a, b) => b.protectionScore - a.protectionScore);
  return { role, skills: results };
}

/** The 2x2 from spotter.md §4.2. */
function classify(importance: number, delegation: number): SkillStatus {
  const hiImp = importance >= 0.55;
  const hiDel = delegation >= 0.5;
  if (hiImp && hiDel) return "protect"; // 🔒
  if (hiImp && !hiDel) return "watch"; // 👁
  if (!hiImp && hiDel) return "letgo"; // 📦
  return "ignore";
}

/** Non-exhaustive by design: only the top N±2 are ever surfaced (spotter.md §4.2.1). */
export function watchlist(store: Store, size = WATCHLIST_SIZE): Skill[] {
  return store
    .allSkills()
    .filter((s) => s.status === "protect" || s.status === "watch" || s.userOverride)
    .sort((a, b) => b.protectionScore - a.protectionScore)
    .slice(0, size);
}

function firstExisting(paths: string[]): string {
  for (const p of paths) if (fs.existsSync(p)) return p;
  return paths[0];
}
