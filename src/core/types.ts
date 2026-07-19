// Shared domain types for Spotter's skill-decay model.

/** How Spotter's charter classifies a tracked skill (see spotter.md §4.2 matrix). */
export type SkillStatus =
  | "protect" // 🔒 high importance + high delegation → actively practiced
  | "watch" // 👁 high importance, low delegation → still naturally practiced
  | "letgo" // 📦 low importance, high delegation → let go, guilt-free
  | "ignore"; // low/low → tracked but never surfaced

/** The four legitimate reasons to protect a skill (spotter.md §4.2.1 why-chips). */
export type WhyChip = "verification" | "career" | "trajectory" | "chosen";

/** Where an event came from — the observation layer that produced it. */
export type EventSource =
  | "claude-code" // hook or transcript
  | "gemini-cli"
  | "codex-cli"
  | "openclaw"
  | "mcp" // an agent called task_started/task_completed directly
  | "manual"; // user/pull-mode

/** A delegation OR practice event — the raw signal feeding the decay model. */
export type EventKind = "delegation" | "practice";

export interface AgentEvent {
  id: number;
  ts: number; // epoch ms
  source: EventSource;
  kind: EventKind;
  skillId: string | null; // tagged skill (null until tagged)
  description: string; // task description / practice prompt
  detail: string | null; // solution+reasoning, or answer
  /** For practice events: FSRS grade 1..4 (again/hard/good/easy). */
  grade: number | null;
  sessionId: string | null;
}

/** The learner model per skill — Loop 1 in spotter.md §5. */
export interface SkillCard {
  skillId: string;
  // FSRS card state (serialized), see scheduler.ts
  fsrs: SerializedCard;
  /** Estimated current retention 0..1 (probability recallable right now). */
  retention: number;
  /** Memory half-life in days derived from stability. */
  halfLifeDays: number;
  /** Elo-style difficulty rating for the ZPD staircase. */
  elo: number;
  /** Brier-style calibration: mean (confidence - correct)^2, lower is better. */
  brier: number;
  reps: number;
}

export interface Skill {
  id: string; // stable slug, e.g. "sql-analytics"
  label: string; // human name, e.g. "SQL analytics"
  status: SkillStatus;
  why: WhyChip[];
  /** O*NET-style occupational importance 0..1 (prior over ranking). */
  importance: number;
  /** Delegation intensity 0..1 (share of this skill's tasks offloaded). */
  delegationIntensity: number;
  /** Composite protection score — what ranks the watchlist. */
  protectionScore: number;
  /** True if the user explicitly overrode the auto-charter for this skill. */
  userOverride: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Serialized ts-fsrs Card (stored as JSON in SQLite). */
export interface SerializedCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

/** A practice directive returned to an agent to weave into the deliverable. */
export interface PracticeDirective {
  skillId: string | null;
  skillLabel: string | null;
  /** Machine tag so the tray/host knows which surface to render. */
  surface: "gap" | "predict-reveal" | "endgame" | "teachback" | "ship-a-or-b" | "none";
  /** Plain-language instruction the agent executes verbatim. */
  instruction: string;
  /** Optional probe question the agent should pose to the user. */
  probe?: string;
  /** Server-side reference answer for later grade_attempt (never shown to user up front). */
  reference?: string;
  rationale: string; // why this skill, this surface (for the ledger/audit trail)
  budgetRemaining: number; // probes left in today's budget
}
