import type { Store } from "../db/store.js";
import type { AgentEvent, EventSource, SkillCard } from "./types.js";
import { tag } from "./tagger.js";
import { canonicalWhy } from "./charter.js";
import {
  freshCard,
  recordPractice as fsrsPractice,
  recomputeRetention,
  updateBrier,
} from "./scheduler.js";

/**
 * The write path into the skill ledger, shared by the MCP tools (Layer 2) and the
 * transcript ingesters (Layer 1). Everything that mutates the decay model goes
 * through here so tagging + FSRS stay consistent regardless of the source.
 */

export interface RecordInput {
  source: EventSource;
  description: string;
  detail?: string | null;
  sessionId?: string | null;
  ts?: number;
  /** Skip if we've already recorded this exact event (idempotent ingest). */
  fingerprint?: string;
}

export interface RecordResult {
  recorded: boolean; // false if deduped
  eventId?: number;
  skillId: string | null;
  skillLabel: string | null;
  confidence: number;
}

function ensureSkillAndCard(store: Store, skillId: string, label: string, why: string[]): SkillCard {
  if (!store.getSkill(skillId)) {
    store.upsertSkill({
      id: skillId,
      label,
      status: "watch",
      why: why as any,
      importance: 0.3,
      delegationIntensity: 0,
      protectionScore: 0,
      userOverride: false,
    });
  }
  let card = store.getCard(skillId);
  if (!card) {
    card = { ...freshCard(Date.now()), skillId };
    store.upsertCard(card);
  }
  return card;
}

/** A delegation event: signal of decay (no retrieval happened). */
export function recordDelegation(store: Store, input: RecordInput): RecordResult {
  const ts = input.ts ?? Date.now();
  if (input.fingerprint && !store.markSeen(input.fingerprint, ts)) {
    return { recorded: false, skillId: null, skillLabel: null, confidence: 0 };
  }
  const tagged = tag(input.description);
  let skillId: string | null = null;
  let label: string | null = null;
  if (tagged) {
    skillId = tagged.skillId;
    label = tagged.label;
    const card = ensureSkillAndCard(store, tagged.skillId, tagged.label, canonicalWhy(tagged.skillId));
    // No FSRS review — just refresh retention at the new "now".
    store.upsertCard(recomputeRetention(card, ts));
  }
  const eventId = store.insertEvent({
    ts,
    source: input.source,
    kind: "delegation",
    skillId,
    description: input.description.slice(0, 2000),
    detail: input.detail ? input.detail.slice(0, 4000) : null,
    grade: null,
    sessionId: input.sessionId ?? null,
  });
  return { recorded: true, eventId, skillId, skillLabel: label, confidence: tagged?.confidence ?? 0 };
}

export interface PracticeInput {
  source: EventSource;
  skillId?: string; // if known
  description: string; // probe / task text (used to tag if skillId missing)
  answer?: string | null;
  grade: number; // FSRS 1..4
  confidence?: number; // 0..1 for Brier calibration
  sessionId?: string | null;
  ts?: number;
}

/** A practice event: an FSRS review that strengthens (or lapses) the skill. */
export function recordPractice(store: Store, input: PracticeInput): RecordResult {
  const ts = input.ts ?? Date.now();
  let skillId = input.skillId;
  let label: string | null = null;
  if (!skillId) {
    const tagged = tag(input.description);
    if (tagged) {
      skillId = tagged.skillId;
      label = tagged.label;
    }
  }
  if (!skillId) {
    return { recorded: false, skillId: null, skillLabel: null, confidence: 0 };
  }
  const existing = store.getSkill(skillId);
  label = label ?? existing?.label ?? skillId;
  let card = ensureSkillAndCard(store, skillId, label, canonicalWhy(skillId));

  card = fsrsPractice(card, input.grade, ts, card.elo);
  if (input.confidence != null) {
    card.brier = updateBrier(card.brier, card.reps, input.confidence, input.grade >= 3);
  }
  store.upsertCard(card);

  const eventId = store.insertEvent({
    ts,
    source: input.source,
    kind: "practice",
    skillId,
    description: input.description.slice(0, 2000),
    detail: input.answer ? input.answer.slice(0, 4000) : null,
    grade: input.grade,
    sessionId: input.sessionId ?? null,
  });
  return { recorded: true, eventId, skillId, skillLabel: label, confidence: 1 };
}

export function ledgerSnapshot(store: Store): Array<{
  skill: ReturnType<Store["getSkill"]>;
  card: SkillCard | undefined;
}> {
  return store.allSkills().map((skill) => ({ skill, card: store.getCard(skill.id) }));
}

export type { AgentEvent };
