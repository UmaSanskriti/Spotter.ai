#!/usr/bin/env node
import { Store } from "./db/store.js";
import { startHttp, startStdio } from "./mcp/transport.js";
import { ingestAll } from "./ingest/runner.js";
import { seed } from "./ingest/seed.js";
import { buildMirror } from "./core/mirror.js";
import { recomputeCharter, watchlist } from "./core/charter.js";
import { getPracticeDirective } from "./core/directives.js";
import { currentRetention } from "./core/scheduler.js";
import { HTTP_HOST, HTTP_PORT, MCP_PATH, DB_PATH } from "./config.js";

const STATUS_EMOJI: Record<string, string> = {
  protect: "🔒",
  watch: "👁 ",
  letgo: "📦",
  ignore: "· ",
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const store = new Store();

  switch (cmd) {
    case "serve": {
      if (rest.includes("--stdio")) {
        await startStdio(store);
        // stdio keeps the process alive via the transport
        return;
      }
      await startHttp(store);
      const url = `http://${HTTP_HOST}:${HTTP_PORT}${MCP_PATH}`;
      console.error(`\n  🐾 Spotter MCP server listening`);
      console.error(`     endpoint : ${url}`);
      console.error(`     health   : http://${HTTP_HOST}:${HTTP_PORT}/health`);
      console.error(`     db       : ${DB_PATH}`);
      console.error(`\n  Add to an MCP client config:`);
      console.error(`     "spotter": { "url": "${url}" }\n`);
      // keep alive
      await new Promise(() => {});
      return;
    }

    case "seed": {
      console.log("Seeding replay corpus (Claude Code + Gemini + Codex fixtures)...");
      const res = seed(store);
      console.log(`  ingested ${res.ingested} delegated tasks + ${res.practiceReps} practice reps`);
      printLedger(store);
      return;
    }

    case "ingest": {
      console.log("Ingesting real transcripts from installed agents...");
      const summary = ingestAll(store, { onProgress: (m) => console.log(m) });
      console.log(`\nTotal new tasks: ${summary.totalRecorded}`);
      return;
    }

    case "mirror": {
      const days = Number(rest[0]) || 60;
      const m = buildMirror(store, days);
      console.log(`\n  ═══ Delegation Mirror (${days}d) ═══\n`);
      console.log("  " + wrap(m.headline, 76, "  ") + "\n");
      console.log(`  Sources: ${Object.entries(m.bySource).map(([k, v]) => `${k}=${v}`).join("  ") || "none"}\n`);
      for (const r of m.rows) {
        const ret = r.retentionPct != null ? `${r.retentionPct}% retention` : "no curve yet";
        console.log(
          `  ${STATUS_EMOJI[r.status] ?? "  "} ${r.label.padEnd(22)} ${String(r.delegationPct).padStart(3)}% delegated   ${ret}`
        );
      }
      console.log();
      return;
    }

    case "ledger": {
      printLedger(store);
      return;
    }

    case "charter": {
      const { role, skills } = recomputeCharter(store);
      console.log(`\n  Inferred role: ${role.label} (${Math.round(role.confidence * 100)}%)\n`);
      console.log(`  Protecting (top by protection score):`);
      for (const s of watchlist(store)) {
        console.log(
          `   ${STATUS_EMOJI[s.status]} ${s.label.padEnd(22)} score ${s.protectionScore.toFixed(2)}  why:[${s.why.join(",")}]`
        );
      }
      console.log(`\n  (${skills.length} skills tracked total; only the watchlist is surfaced.)\n`);
      return;
    }

    case "directive": {
      const ctx = rest.join(" ") || "write a SQL query for weekly revenue";
      const d = getPracticeDirective(store, ctx, { respectBudget: false });
      console.log(`\n  Task: "${ctx}"\n`);
      console.log(`  → skill    : ${d.skillLabel ?? "(none)"}`);
      console.log(`  → surface  : ${d.surface}`);
      console.log(`  → instruct : ${d.instruction}`);
      if (d.probe) console.log(`  → probe    : ${d.probe}`);
      console.log(`  → rationale: ${d.rationale}\n`);
      return;
    }

    default:
      console.log(`Spotter — skill-decay guardian MCP server

Usage: spotter <command>

  serve [--stdio]   Start the MCP server (streamable HTTP on localhost, or stdio shim)
  seed              Load the demo replay corpus (multi-agent fixtures) into the ledger
  ingest            Ingest real transcripts from installed agents (Claude Code/Gemini/Codex)
  mirror [days]     Print the Delegation Mirror
  ledger            Print the full skill ledger
  charter           Recompute + print the auto-charter (inferred role + watchlist)
  directive "text"  Preview the practice directive for a task context

  DB: ${DB_PATH}
`);
  }
}

function printLedger(store: Store) {
  const now = Date.now();
  recomputeCharter(store);
  const wl = new Set(watchlist(store).map((s) => s.id));
  const rows = store.allSkills().sort((a, b) => b.protectionScore - a.protectionScore);
  console.log(`\n  ═══ Skill Ledger ═══   (★ = watchlist)\n`);
  console.log(
    `  ${"skill".padEnd(22)} ${"status".padEnd(8)} ${"prot".padStart(4)} ${"deleg".padStart(5)} ${"reten".padStart(5)} ${"half-life".padStart(9)} reps`
  );
  for (const s of rows) {
    const c = store.getCard(s.id);
    const ret = c && c.reps > 0 ? `${Math.round(currentRetention(c, now) * 100)}%` : "—";
    const hl = c ? `${c.halfLifeDays.toFixed(1)}d` : "—";
    const star = wl.has(s.id) ? "★" : " ";
    console.log(
      `  ${star}${s.label.padEnd(21)} ${(STATUS_EMOJI[s.status] + s.status).padEnd(8)} ${s.protectionScore.toFixed(2)} ${s.delegationIntensity.toFixed(2).padStart(5)} ${ret.padStart(5)} ${hl.padStart(9)} ${c?.reps ?? 0}`
    );
  }
  console.log();
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > width) {
      lines.push(line.trim());
      line = "";
    }
    line += w + " ";
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n" + indent);
}

main().catch((err) => {
  console.error("Spotter error:", err);
  process.exit(1);
});
