import type { WhyChip } from "./types.js";

/**
 * Task -> skill classifier. spotter.md §4.2.1 wants the skill LIST to emerge
 * bottom-up (embed + cluster transcripts, LLM names each cluster). That needs an
 * embedding model; to keep the MCP server fully local and deterministic for the
 * hackathon spine, this ships a keyword-anchored classifier over the SAME
 * canonical skills the O*NET prior knows about, and exposes an async `tagLLM`
 * hook so a local/Claude model can be swapped in without touching callers.
 *
 * The distinction the spec cares about is preserved: canonical skills are only a
 * mapping target for ranking; nothing here imposes a taxonomy on what gets probed.
 */

export interface TagResult {
  skillId: string;
  label: string;
  confidence: number; // 0..1
  why: WhyChip[];
}

interface Rule {
  skillId: string;
  label: string;
  why: WhyChip[];
  patterns: RegExp[];
}

// Anchored to canonicalSkills in data/onet-profiles.json.
const RULES: Rule[] = [
  rule("debugging", "Debugging", ["verification", "career"], [
    /\bdebug/i, /\bstack ?trace/i, /\bfix (the )?bug/i, /race condition/i,
    /null ?pointer|segfault|panic|exception|traceback/i, /why (is|does).*(fail|crash|break)/i,
    /reproduce|repro\b/i, /flaky test/i,
  ]),
  rule("sql-analytics", "SQL analytics", ["verification"], [
    /\bsql\b/i, /\bquery\b/i, /\bjoin\b/i, /group by|window function|cte\b/i,
    /\bselect .* from/i, /postgres|mysql|sqlite|bigquery|snowflake/i, /aggregate|rollup/i,
  ]),
  rule("system-design", "System design", ["career", "trajectory"], [
    /system design|architecture|design (a|the) (system|service)/i,
    /\bqueue\b|\bcron\b|\bcache\b|sharding|scal(e|ing|ability)/i,
    /trade[- ]?off|tradeoff/i, /microservice|event[- ]driven|pub ?sub/i,
  ]),
  rule("code-review", "Code review", ["verification"], [
    /code review|review (the|this|my) (pr|diff|code|change)/i, /pull request|\bpr\b/i,
    /read (the )?diff/i, /refactor/i,
  ]),
  rule("testing", "Testing", ["verification"], [
    /\bunit test|integration test|write tests?\b/i, /test coverage|jest|pytest|vitest|mocha/i,
  ]),
  rule("persuasive-writing", "Persuasive writing", ["career"], [
    /investor update|pitch|fundrais/i, /persuad|convince/i, /cold email|outreach/i,
    /draft (an?|the) (email|message|update|memo)/i,
  ]),
  rule("technical-writing", "Technical writing", ["career"], [
    /\bdocs?\b|documentation|readme|write[- ]?up|design doc|rfc\b/i, /explain how|tutorial/i,
  ]),
  rule("financial-modeling", "Financial modeling", ["verification", "career"], [
    /financial model|\bp&l\b|cash ?flow|runway|burn rate|valuation|cap table|forecast/i,
  ]),
  rule("statistical-analysis", "Statistical analysis", ["verification", "career"], [
    /statistic|\bp[- ]?value|regression|hypothesis test|confidence interval|power analysis|anova|bayesian/i,
  ]),
  rule("experiment-design", "Experiment design", ["career"], [
    /experiment design|\ba\/b test|dose[- ]response|study design|control group|randomiz/i,
  ]),
  rule("data-viz", "Data visualization", ["verification"], [
    /\bchart|\bplot|\bgraph\b|visuali[sz]|dashboard|matplotlib|d3\b|recharts/i,
  ]),
  rule("negotiation", "Negotiation", ["career"], [
    /negotiat|counter[- ]?offer|term sheet|contract terms/i,
  ]),
  rule("regulatory-writing", "Regulatory writing", ["career", "verification"], [
    /regulatory|\bfda\b|\bgxp\b|compliance (doc|summary)|clinical (report|summary)/i,
  ]),
  rule("literature-synthesis", "Literature synthesis", ["career"], [
    /literature (review|synth)|summari[sz]e (the )?(papers?|studies|research)/i,
  ]),
  rule("algorithms", "Algorithms", ["career"], [
    /algorithm|big[- ]?o|dynamic programming|complexity|leetcode|data structure/i,
  ]),
];

function rule(skillId: string, label: string, why: WhyChip[], patterns: RegExp[]): Rule {
  return { skillId, label, why, patterns };
}

/** Deterministic keyword tag. Returns null when nothing matches. */
export function tag(text: string): TagResult | null {
  if (!text) return null;
  let best: { rule: Rule; hits: number } | null = null;
  for (const r of RULES) {
    let hits = 0;
    for (const p of r.patterns) if (p.test(text)) hits++;
    if (hits > 0 && (!best || hits > best.hits)) best = { rule: r, hits };
  }
  if (!best) return null;
  // more distinct pattern hits => higher confidence, saturating.
  const confidence = Math.min(0.95, 0.55 + 0.15 * best.hits);
  return { skillId: best.rule.skillId, label: best.rule.label, confidence, why: best.rule.why };
}

/** Hook for an LLM tagger (local model or Claude). Falls back to keyword tag. */
export type LLMTagger = (text: string) => Promise<TagResult | null>;

export async function tagWith(text: string, llm?: LLMTagger): Promise<TagResult | null> {
  if (llm) {
    try {
      const r = await llm(text);
      if (r) return r;
    } catch {
      /* fall through to deterministic tagger */
    }
  }
  return tag(text);
}

export function knownSkillIds(): string[] {
  return RULES.map((r) => r.skillId);
}
