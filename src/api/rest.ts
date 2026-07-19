import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type http from "node:http";
import type { Store } from "../db/store.js";
import { buildMirror } from "../core/mirror.js";
import { recomputeCharter, watchlist } from "../core/charter.js";
import { getPracticeDirective, localDay } from "../core/directives.js";
import { currentRetention } from "../core/scheduler.js";
import { grade } from "../core/grader.js";
import { recordPractice, recordDelegation, ledgerSnapshot } from "../core/ledger.js";
import { seed } from "../ingest/seed.js";
import { DEFAULT_DAILY_PROBE_BUDGET } from "../config.js";
import type { SkillStatus, WhyChip } from "../core/types.js";

/**
 * JSON API consumed by the Layer 3 UI (spotter.md §4.6). Everything the tray
 * popover, Mirror window, wait-cards, ledger, and digest render comes from here,
 * off the single on-device ledger. Kept separate from the MCP server so the UI and
 * the agents share one brain but speak different protocols.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = firstExisting([
  path.join(__dirname, "../../ui"),
  path.join(__dirname, "../ui"),
]);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

export async function handleApiOrStatic(
  store: Store,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<boolean> {
  if (url.pathname.startsWith("/api/")) {
    await handleApi(store, req, res, url);
    return true;
  }
  // Serve the UI at "/" and any non-reserved path (SPA-friendly).
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    !["/mcp", "/event", "/health"].includes(url.pathname)
  ) {
    return serveStatic(res, url);
  }
  return false;
}

async function handleApi(store: Store, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const send = (data: unknown, code = 200) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  };
  const now = Date.now();
  const p = url.pathname.replace(/\/$/, "");

  try {
    // ---- popover summary / global state ----
    if (p === "/api/state" && req.method === "GET") {
      recomputeCharter(store);
      const budget = Number(store.getMeta("dailyBudget") ?? DEFAULT_DAILY_PROBE_BUDGET);
      const used = store.probesToday(localDay(now));
      const wl = watchlist(store).map((s) => decorate(store, s.id, now));
      return send({
        role: store.getMeta("role"),
        paused: !!store.getMeta("paused"),
        budget,
        probesUsedToday: used,
        health: healthScore(wl),
        watchlist: wl,
        mirrorHeadline: buildMirror(store).headline,
        suggestion: topSuggestion(store, now),
      });
    }

    // ---- Delegation Mirror ----
    if (p === "/api/mirror" && req.method === "GET") {
      const days = Number(url.searchParams.get("days") ?? 60);
      return send(buildMirror(store, days));
    }

    // ---- full ledger ----
    if (p === "/api/ledger" && req.method === "GET") {
      recomputeCharter(store);
      const wl = new Set(watchlist(store).map((s) => s.id));
      const rows = ledgerSnapshot(store)
        .map(({ skill }) => ({ ...decorate(store, skill!.id, now), onWatchlist: wl.has(skill!.id) }))
        .sort((a, b) => b.protectionScore - a.protectionScore);
      return send({ role: store.getMeta("role"), skills: rows });
    }

    // ---- weekly Skill Health digest (exception-based) ----
    if (p === "/api/digest" && req.method === "GET") {
      return send(buildDigest(store, now));
    }

    // ---- practice directive (preview or committed) ----
    if (p === "/api/directive" && req.method === "GET") {
      const ctx = url.searchParams.get("context") ?? "";
      const commit = url.searchParams.get("commit") === "1";
      return send(getPracticeDirective(store, ctx, { respectBudget: commit }));
    }

    // ---- a ready-to-render wait-card (Call-your-shot / Veil) ----
    if (p === "/api/wait-card" && req.method === "GET") {
      return send(buildWaitCard(store, url.searchParams.get("context") ?? "", now));
    }

    // ---- grade an attempt ----
    if (p === "/api/grade" && req.method === "POST") {
      const body = (await readJson(req)) as any;
      const result = grade(body.user_answer ?? "", body.reference ?? "");
      const rec = recordPractice(store, {
        source: "manual",
        skillId: body.skill_id,
        description: body.reference ?? body.user_answer ?? "practice",
        answer: body.user_answer,
        grade: result.grade,
        confidence: body.confidence,
      });
      recomputeCharter(store);
      const card = rec.skillId ? store.getCard(rec.skillId) : undefined;
      return send({
        ...result,
        skill: rec.skillId,
        newRetentionPct: card ? Math.round(currentRetention(card, now) * 100) : null,
        newHalfLifeDays: card ? Number(card.halfLifeDays.toFixed(1)) : null,
      });
    }

    // ---- charter override ----
    if (p === "/api/charter" && req.method === "POST") {
      const body = (await readJson(req)) as any;
      if (!store.getSkill(body.skill_id)) return send({ error: "unknown skill" }, 404);
      store.setSkillStatus(body.skill_id, body.action as SkillStatus, true);
      if (body.why) store.addWhy(body.skill_id, body.why as WhyChip);
      return send({ ok: true });
    }

    // ---- budget get/set ----
    if (p === "/api/budget") {
      if (req.method === "POST") {
        const body = (await readJson(req)) as any;
        store.setMeta("dailyBudget", Math.max(0, Math.round(Number(body.budget) || 0)));
      }
      return send({ budget: Number(store.getMeta("dailyBudget") ?? DEFAULT_DAILY_PROBE_BUDGET) });
    }

    // ---- pause get/set ----
    if (p === "/api/pause") {
      if (req.method === "POST") {
        const body = (await readJson(req)) as any;
        store.setMeta("paused", !!body.paused);
      }
      return send({ paused: !!store.getMeta("paused") });
    }

    // ---- reset + reseed demo (handy from the UI) ----
    if (p === "/api/seed" && req.method === "POST") {
      const r = seed(store);
      return send({ ok: true, ...r });
    }

    // ---- record an ad-hoc delegation (pull mode / demo) ----
    if (p === "/api/delegate" && req.method === "POST") {
      const body = (await readJson(req)) as any;
      const r = recordDelegation(store, { source: body.source ?? "manual", description: body.description ?? "" });
      recomputeCharter(store);
      return send(r);
    }

    return send({ error: "not found" }, 404);
  } catch (e) {
    return send({ error: (e as Error).message }, 500);
  }
}

function decorate(store: Store, skillId: string, now: number) {
  const s = store.getSkill(skillId)!;
  const c = store.getCard(skillId);
  return {
    id: s.id,
    label: s.label,
    status: s.status,
    why: s.why,
    protectionScore: Number(s.protectionScore.toFixed(2)),
    delegationIntensity: Number(s.delegationIntensity.toFixed(2)),
    retentionPct: c && c.reps > 0 ? Math.round(currentRetention(c, now) * 100) : null,
    halfLifeDays: c ? Number(c.halfLifeDays.toFixed(1)) : null,
    brier: c ? Number(c.brier.toFixed(3)) : null,
    reps: c?.reps ?? 0,
  };
}

/** Overall charter health 0..100 = mean retention of watchlist skills that have curves. */
function healthScore(wl: ReturnType<typeof decorate>[]): number {
  const withCurve = wl.filter((s) => s.retentionPct != null);
  if (!withCurve.length) return 100;
  return Math.round(withCurve.reduce((a, s) => a + (s.retentionPct as number), 0) / withCurve.length);
}

function topSuggestion(store: Store, now: number) {
  const wl = watchlist(store).map((s) => decorate(store, s.id, now));
  const due = wl
    .filter((s) => s.status === "protect" || s.status === "watch")
    .sort((a, b) => (a.retentionPct ?? 50) - (b.retentionPct ?? 50))[0];
  if (!due) return null;
  return { skillId: due.id, label: due.label, retentionPct: due.retentionPct };
}

function buildDigest(store: Store, now: number) {
  const wl = watchlist(store).map((s) => decorate(store, s.id, now)).filter((s) => s.retentionPct != null);
  const byRet = [...wl].sort((a, b) => (a.retentionPct as number) - (b.retentionPct as number));
  const decliner = byRet[0] ?? null;
  const gainer = byRet[byRet.length - 1] ?? null;
  const suggestion = topSuggestion(store, now);
  return {
    decliner,
    gainer,
    suggestion,
    headline: decliner
      ? `${decliner.label} slipped to ${decliner.retentionPct}% retention — one rep would help.`
      : "All chartered skills are holding steady.",
  };
}

/** Build a wait-card payload: Call-your-shot for debug-ish skills, else the Veil. */
function buildWaitCard(store: Store, context: string, now: number) {
  if (store.getMeta("paused")) return { surface: "none", reason: "paused" };
  const d = getPracticeDirective(store, context || "", { respectBudget: false });
  if (!d.skillId) return { surface: "none", reason: "no chartered skill" };
  const card = store.getCard(d.skillId);
  const retentionPct = card && card.reps > 0 ? Math.round(currentRetention(card, now) * 100) : null;

  // For debugging/system tasks, offer a "click the suspect file" tree (spotter.md §4.3 S1).
  const fileTree = /debug|bug|crash|race|trace|system|architecture|review/i.test(context + d.skillLabel)
    ? mockRepoTree(d.skillLabel ?? "")
    : null;

  return {
    surface: fileTree ? "call-your-shot" : "veil",
    skillId: d.skillId,
    skillLabel: d.skillLabel,
    retentionPct,
    probe: d.probe ?? `Take a beat: what's your instinct on this ${d.skillLabel} task?`,
    instruction: d.instruction,
    rationale: d.rationale,
    fileTree,
  };
}

function mockRepoTree(skillLabel: string) {
  // A plausible tree so "click your suspect" works in the demo without a real repo.
  return [
    { path: "src/worker/queue.ts", hint: "consumes jobs" },
    { path: "src/worker/handler.ts", hint: "processes payload" },
    { path: "src/db/pool.ts", hint: "connection pool" },
    { path: "src/api/routes.ts", hint: "request entry" },
    { path: "src/util/retry.ts", hint: "backoff logic" },
  ];
}

function serveStatic(res: http.ServerResponse, url: URL): boolean {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.join(UI_DIR, path.normalize(rel));
  if (!filePath.startsWith(UI_DIR)) {
    res.writeHead(403).end("forbidden");
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback to index.html
    const idx = path.join(UI_DIR, "index.html");
    if (fs.existsSync(idx)) {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(fs.readFileSync(idx));
      return true;
    }
    res.writeHead(404).end("not found");
    return true;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(fs.readFileSync(filePath));
  return true;
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function firstExisting(paths: string[]): string {
  for (const p of paths) if (fs.existsSync(p)) return p;
  return paths[0];
}
