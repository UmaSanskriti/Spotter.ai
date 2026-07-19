import type { Store } from "../db/store.js";
import { currentRetention } from "./scheduler.js";

/**
 * The Delegation Mirror (spotter.md §4.2, "Minute 1"): quantify offloading from
 * backfilled transcripts. The Spotify-Wrapped moment — instant, screenshotable.
 */

export interface MirrorSkillRow {
  skillId: string;
  label: string;
  delegated: number;
  practiced: number;
  delegationPct: number; // 0..100
  retentionPct: number | null; // null if never practiced (no curve yet)
  status: string;
}

export interface MirrorReport {
  windowDays: number;
  totalTasks: number;
  totalDelegated: number;
  bySource: Record<string, number>;
  rows: MirrorSkillRow[];
  headline: string;
}

export function buildMirror(store: Store, windowDays = 60): MirrorReport {
  const now = Date.now();
  const since = now - windowDays * 86_400_000;
  const events = store.allEvents(since);

  const del = new Map<string, number>();
  const prac = new Map<string, number>();
  for (const e of events) {
    if (!e.skillId) continue;
    (e.kind === "delegation" ? del : prac).set(
      e.skillId,
      ((e.kind === "delegation" ? del : prac).get(e.skillId) ?? 0) + 1
    );
  }

  const skills = store.allSkills();
  const rows: MirrorSkillRow[] = [];
  for (const s of skills) {
    const d = del.get(s.id) ?? 0;
    const p = prac.get(s.id) ?? 0;
    if (d + p === 0) continue;
    const card = store.getCard(s.id);
    rows.push({
      skillId: s.id,
      label: s.label,
      delegated: d,
      practiced: p,
      delegationPct: Math.round((d / (d + p)) * 100),
      retentionPct: card && card.reps > 0 ? Math.round(currentRetention(card, now) * 100) : null,
      status: s.status,
    });
  }
  rows.sort((a, b) => b.delegated - a.delegated);

  const totalDelegated = events.filter((e) => e.kind === "delegation").length;
  const totalTasks = events.filter((e) => e.kind === "delegation" || e.kind === "practice").length;

  // Headline mirrors the spec's example copy.
  const top = rows.slice(0, 3).map((r) => `${r.delegationPct}% of your ${r.label}`);
  const decliner = [...rows]
    .filter((r) => r.retentionPct != null)
    .sort((a, b) => (a.retentionPct! - b.retentionPct!))[0];
  const tail = decliner
    ? ` Estimated retention on ${decliner.label}: ${decliner.retentionPct}%${
        decliner.retentionPct! < 70 ? " and falling." : "."
      }`
    : "";
  const headline =
    `In the last ${windowDays} days you delegated ${totalDelegated} tasks: ` +
    (top.length ? top.join(", ") + "." : "no tagged tasks yet.") +
    tail;

  return {
    windowDays,
    totalTasks,
    totalDelegated,
    bySource: store.countBySource(),
    rows,
    headline,
  };
}
