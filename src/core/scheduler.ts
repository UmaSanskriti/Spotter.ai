import {
  fsrs,
  createEmptyCard,
  generatorParameters,
  forgetting_curve,
  FSRS6_DEFAULT_DECAY,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";
import type { SkillCard, SerializedCard } from "./types.js";

/**
 * Loop 1 — the learner model (spotter.md §5). Per (user, skill) forgetting curve
 * fit online via FSRS, plus an Elo difficulty rating and a Brier calibration score.
 *
 * FSRS ships with population priors, so scheduling is meaningful from rep #0
 * (spotter.md §4.2 "no dead week").
 */

const params = generatorParameters({ enable_fuzz: false });
const engine = fsrs(params);
const DECAY = FSRS6_DEFAULT_DECAY;

export function freshCard(now: number): SkillCard {
  const card = createEmptyCard(new Date(now));
  return {
    skillId: "",
    fsrs: serialize(card),
    retention: 1,
    halfLifeDays: halfLifeFromStability(card.stability),
    elo: 1200,
    brier: 0.25, // uninformative prior (max variance for a 0/1 outcome)
    reps: 0,
  };
}

/** Retrievability of a skill *right now*, given time since its last practice. */
export function currentRetention(card: SkillCard, now: number): number {
  const last = card.fsrs.last_review ? new Date(card.fsrs.last_review).getTime() : new Date(card.fsrs.due).getTime();
  const elapsedDays = Math.max(0, (now - last) / 86_400_000);
  if (card.fsrs.stability <= 0) return 1;
  return clamp01(forgetting_curve(DECAY, elapsedDays, card.fsrs.stability));
}

/** Days until retrievability decays to 0.5 — the intuitive "half-life". */
export function halfLifeFromStability(stability: number): number {
  if (stability <= 0) return 0;
  // R(t) = forgetting_curve(DECAY, t, S) is monotonically decreasing; solve R=0.5.
  let lo = 0;
  let hi = Math.max(1, stability) * 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = forgetting_curve(DECAY, mid, stability);
    if (r > 0.5) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A practice event = an FSRS review. grade is 1..4 (again/hard/good/easy).
 * Returns the updated card with fresh retention, half-life, and Elo.
 */
export function recordPractice(card: SkillCard, grade: number, now: number, difficulty = 1200): SkillCard {
  const g = toGrade(grade);
  const prev = deserialize(card.fsrs);
  const { card: next } = engine.next(prev, new Date(now), g);
  const updated: SkillCard = {
    ...card,
    fsrs: serialize(next),
    reps: card.reps + 1,
    halfLifeDays: halfLifeFromStability(next.stability),
    elo: updateElo(card.elo, difficulty, grade >= 3 ? 1 : 0),
  };
  updated.retention = currentRetention(updated, now);
  return updated;
}

/**
 * A delegation event is NOT a review — no retrieval happened (spotter.md §5 Loop 1).
 * It doesn't advance the FSRS card; it only means more time passed without practice,
 * so we simply recompute retention at `now`. (Delegation *intensity* — which feeds
 * the charter ranking — is aggregated separately in charter.ts.)
 */
export function recomputeRetention(card: SkillCard, now: number): SkillCard {
  return { ...card, retention: currentRetention(card, now) };
}

/** Standard Elo update; outcome 1 = handled it, 0 = struggled. */
function updateElo(rating: number, opponent: number, outcome: number, k = 32): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(rating + k * (outcome - expected));
}

/** Update the Brier calibration score with a (confidence, correct) observation. */
export function updateBrier(prevBrier: number, reps: number, confidence: number, correct: boolean): number {
  const obs = (confidence - (correct ? 1 : 0)) ** 2;
  const n = Math.max(1, reps);
  return (prevBrier * n + obs) / (n + 1);
}

// ---- (de)serialization between our JSON shape and ts-fsrs Card ----
function serialize(c: Card): SerializedCard {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? new Date(c.last_review).toISOString() : undefined,
  };
}

function deserialize(s: SerializedCard): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}

function toGrade(g: number): Grade {
  const clamped = Math.min(4, Math.max(1, Math.round(g)));
  return clamped as Grade;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export { Rating };
