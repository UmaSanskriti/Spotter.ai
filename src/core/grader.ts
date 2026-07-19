/**
 * Reference-based grading (spotter.md §6): the agent already holds the correct
 * solution, so grading is comparison, not generation — small/local models suffice.
 *
 * Ships a deterministic lexical grader (token overlap + key-term coverage) with an
 * async LLM hook. Returns an FSRS grade (1..4) plus a one-line delta, which is what
 * `grade_attempt` hands back (spotter.md §3 #8: feedback must accompany testing).
 */

export interface GradeResult {
  grade: number; // FSRS 1..4 (again/hard/good/easy)
  score: number; // 0..1 similarity
  correct: boolean; // score >= pass threshold
  delta: string; // one-line feedback: what they missed / got right
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with", "is",
  "are", "be", "it", "this", "that", "as", "at", "by", "we", "you", "i", "so", "if",
  "then", "than", "use", "using", "because", "why", "how", "what", "which",
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9_+#.]+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Deterministic reference grader. */
export function grade(userAnswer: string, reference: string): GradeResult {
  const ua = new Set(tokenize(userAnswer));
  const ref = tokenize(reference);
  const refSet = new Set(ref);
  if (refSet.size === 0) {
    // No reference to grade against: reward the attempt (generation effect).
    return { grade: ua.size > 0 ? 3 : 2, score: ua.size > 0 ? 0.7 : 0.4, correct: ua.size > 0, delta: "Logged your attempt." };
  }

  let hit = 0;
  const missed: string[] = [];
  for (const t of refSet) {
    if (ua.has(t)) hit++;
    else missed.push(t);
  }
  const coverage = hit / refSet.size; // recall of key reference terms

  // Jaccard as a secondary signal to penalize wild over-answers.
  const union = new Set([...ua, ...refSet]).size;
  const jaccard = union > 0 ? [...ua].filter((t) => refSet.has(t)).length / union : 0;

  const score = 0.75 * coverage + 0.25 * jaccard;

  let g: number;
  if (score >= 0.7) g = 4;
  else if (score >= 0.45) g = 3;
  else if (score >= 0.2) g = 2;
  else g = 1;

  const topMissed = missed.slice(0, 3).join(", ");
  const delta =
    g >= 3
      ? `You nailed the key ideas${missed.length ? `; only missed: ${topMissed}.` : "."}`
      : `Closest gap — you didn't mention: ${topMissed || "the core idea"}.`;

  return { grade: g, score: Number(score.toFixed(3)), correct: score >= 0.45, delta };
}

export type LLMGrader = (userAnswer: string, reference: string) => Promise<GradeResult | null>;

export async function gradeWith(
  userAnswer: string,
  reference: string,
  llm?: LLMGrader
): Promise<GradeResult> {
  if (llm) {
    try {
      const r = await llm(userAnswer, reference);
      if (r) return r;
    } catch {
      /* fall through */
    }
  }
  return grade(userAnswer, reference);
}
