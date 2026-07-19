import Database from "better-sqlite3";
import { DB_PATH, ensureHome } from "../config.js";
import type {
  AgentEvent,
  EventKind,
  EventSource,
  Skill,
  SkillCard,
  SkillStatus,
  WhyChip,
} from "../core/types.js";

/**
 * The single on-device skill ledger. One SQLite file = the cross-agent view
 * (spotter.md §6: "decay is a property of you, not of any one tool").
 */
export class Store {
  readonly db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    ensureHome();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id                   TEXT PRIMARY KEY,
        label                TEXT NOT NULL,
        status               TEXT NOT NULL,
        why                  TEXT NOT NULL DEFAULT '[]',
        importance           REAL NOT NULL DEFAULT 0,
        delegation_intensity REAL NOT NULL DEFAULT 0,
        protection_score     REAL NOT NULL DEFAULT 0,
        user_override        INTEGER NOT NULL DEFAULT 0,
        created_at           INTEGER NOT NULL,
        updated_at           INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cards (
        skill_id       TEXT PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
        fsrs           TEXT NOT NULL,
        retention      REAL NOT NULL DEFAULT 1,
        half_life_days REAL NOT NULL DEFAULT 1,
        elo            REAL NOT NULL DEFAULT 1200,
        brier          REAL NOT NULL DEFAULT 0.25,
        reps           INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          INTEGER NOT NULL,
        source      TEXT NOT NULL,
        kind        TEXT NOT NULL,
        skill_id    TEXT,
        description TEXT NOT NULL,
        detail      TEXT,
        grade       INTEGER,
        session_id  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_skill ON events(skill_id);
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

      -- dedupe key so re-ingesting a transcript is idempotent
      CREATE TABLE IF NOT EXISTS seen (
        fingerprint TEXT PRIMARY KEY,
        ts          INTEGER NOT NULL
      );

      -- daily probe budget accounting (spotter.md §4.4)
      CREATE TABLE IF NOT EXISTS probe_log (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        day      TEXT NOT NULL,           -- YYYY-MM-DD (local)
        skill_id TEXT,
        surface  TEXT,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_probe_day ON probe_log(day);

      -- generic key/value for charter meta (inferred role, etc.)
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ---- meta ----------------------------------------------------------------
  setMeta(key: string, value: unknown): void {
    this.db
      .prepare(`INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run(key, JSON.stringify(value));
  }
  getMeta<T = unknown>(key: string): T | undefined {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key=?`).get(key) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  // ---- dedupe --------------------------------------------------------------
  /** Returns true if newly recorded, false if already seen. */
  markSeen(fingerprint: string, ts: number): boolean {
    const res = this.db
      .prepare(`INSERT OR IGNORE INTO seen(fingerprint, ts) VALUES(?,?)`)
      .run(fingerprint, ts);
    return res.changes > 0;
  }

  // ---- skills --------------------------------------------------------------
  upsertSkill(s: Omit<Skill, "createdAt" | "updatedAt"> & Partial<Pick<Skill, "createdAt" | "updatedAt">>): void {
    const now = Date.now();
    const existing = this.getSkill(s.id);
    this.db
      .prepare(
        `INSERT INTO skills(id,label,status,why,importance,delegation_intensity,protection_score,user_override,created_at,updated_at)
         VALUES(@id,@label,@status,@why,@importance,@delegation_intensity,@protection_score,@user_override,@created_at,@updated_at)
         ON CONFLICT(id) DO UPDATE SET
           label=excluded.label, status=excluded.status, why=excluded.why,
           importance=excluded.importance, delegation_intensity=excluded.delegation_intensity,
           protection_score=excluded.protection_score, user_override=excluded.user_override,
           updated_at=excluded.updated_at`
      )
      .run({
        id: s.id,
        label: s.label,
        status: s.status,
        why: JSON.stringify(s.why ?? []),
        importance: s.importance ?? 0,
        delegation_intensity: s.delegationIntensity ?? 0,
        protection_score: s.protectionScore ?? 0,
        user_override: s.userOverride ? 1 : 0,
        created_at: existing?.createdAt ?? s.createdAt ?? now,
        updated_at: now,
      });
  }

  getSkill(id: string): Skill | undefined {
    const row = this.db.prepare(`SELECT * FROM skills WHERE id=?`).get(id) as any;
    return row ? rowToSkill(row) : undefined;
  }

  allSkills(): Skill[] {
    return (this.db.prepare(`SELECT * FROM skills`).all() as any[]).map(rowToSkill);
  }

  setSkillStatus(id: string, status: SkillStatus, override: boolean): void {
    this.db
      .prepare(`UPDATE skills SET status=?, user_override=?, updated_at=? WHERE id=?`)
      .run(status, override ? 1 : 0, Date.now(), id);
  }

  addWhy(id: string, chip: WhyChip): void {
    const s = this.getSkill(id);
    if (!s) return;
    if (!s.why.includes(chip)) {
      s.why.push(chip);
      this.db.prepare(`UPDATE skills SET why=?, updated_at=? WHERE id=?`).run(JSON.stringify(s.why), Date.now(), id);
    }
  }

  // ---- cards ---------------------------------------------------------------
  getCard(skillId: string): SkillCard | undefined {
    const row = this.db.prepare(`SELECT * FROM cards WHERE skill_id=?`).get(skillId) as any;
    if (!row) return undefined;
    return {
      skillId: row.skill_id,
      fsrs: JSON.parse(row.fsrs),
      retention: row.retention,
      halfLifeDays: row.half_life_days,
      elo: row.elo,
      brier: row.brier,
      reps: row.reps,
    };
  }

  upsertCard(c: SkillCard): void {
    this.db
      .prepare(
        `INSERT INTO cards(skill_id,fsrs,retention,half_life_days,elo,brier,reps)
         VALUES(@skill_id,@fsrs,@retention,@half_life_days,@elo,@brier,@reps)
         ON CONFLICT(skill_id) DO UPDATE SET
           fsrs=excluded.fsrs, retention=excluded.retention, half_life_days=excluded.half_life_days,
           elo=excluded.elo, brier=excluded.brier, reps=excluded.reps`
      )
      .run({
        skill_id: c.skillId,
        fsrs: JSON.stringify(c.fsrs),
        retention: c.retention,
        half_life_days: c.halfLifeDays,
        elo: c.elo,
        brier: c.brier,
        reps: c.reps,
      });
  }

  // ---- events --------------------------------------------------------------
  insertEvent(e: Omit<AgentEvent, "id">): number {
    const res = this.db
      .prepare(
        `INSERT INTO events(ts,source,kind,skill_id,description,detail,grade,session_id)
         VALUES(@ts,@source,@kind,@skill_id,@description,@detail,@grade,@session_id)`
      )
      .run({
        ts: e.ts,
        source: e.source,
        kind: e.kind,
        skill_id: e.skillId,
        description: e.description,
        detail: e.detail,
        grade: e.grade,
        session_id: e.sessionId,
      });
    return Number(res.lastInsertRowid);
  }

  updateEventDetail(id: number, detail: string): void {
    this.db.prepare(`UPDATE events SET detail=? WHERE id=?`).run(detail.slice(0, 4000), id);
  }

  getEvent(id: number): AgentEvent | undefined {
    const row = this.db.prepare(`SELECT * FROM events WHERE id=?`).get(id) as any;
    return row ? rowToEvent(row) : undefined;
  }

  eventsForSkill(skillId: string, kind?: EventKind): AgentEvent[] {
    const rows = kind
      ? (this.db.prepare(`SELECT * FROM events WHERE skill_id=? AND kind=? ORDER BY ts`).all(skillId, kind) as any[])
      : (this.db.prepare(`SELECT * FROM events WHERE skill_id=? ORDER BY ts`).all(skillId) as any[]);
    return rows.map(rowToEvent);
  }

  allEvents(sinceMs?: number): AgentEvent[] {
    const rows = sinceMs
      ? (this.db.prepare(`SELECT * FROM events WHERE ts>=? ORDER BY ts`).all(sinceMs) as any[])
      : (this.db.prepare(`SELECT * FROM events ORDER BY ts`).all() as any[]);
    return rows.map(rowToEvent);
  }

  countBySource(): Record<string, number> {
    const rows = this.db.prepare(`SELECT source, COUNT(*) n FROM events GROUP BY source`).all() as any[];
    return Object.fromEntries(rows.map((r) => [r.source, r.n]));
  }

  // ---- probe budget --------------------------------------------------------
  probesToday(day: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) n FROM probe_log WHERE day=?`).get(day) as { n: number };
    return row.n;
  }

  logProbe(day: string, skillId: string | null, surface: string): void {
    this.db.prepare(`INSERT INTO probe_log(day,skill_id,surface,ts) VALUES(?,?,?,?)`).run(day, skillId, surface, Date.now());
  }
}

function rowToSkill(row: any): Skill {
  return {
    id: row.id,
    label: row.label,
    status: row.status as SkillStatus,
    why: JSON.parse(row.why) as WhyChip[],
    importance: row.importance,
    delegationIntensity: row.delegation_intensity,
    protectionScore: row.protection_score,
    userOverride: !!row.user_override,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvent(row: any): AgentEvent {
  return {
    id: row.id,
    ts: row.ts,
    source: row.source as EventSource,
    kind: row.kind as EventKind,
    skillId: row.skill_id,
    description: row.description,
    detail: row.detail,
    grade: row.grade,
    sessionId: row.session_id,
  };
}
