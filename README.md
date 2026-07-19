# Spotter — a skill-decay guardian for any AI agent

*One MCP server, one skill ledger — across Claude Code, Gemini CLI, and Codex.*

> An AI agent is a scaffold that never fades. Spotter puts the fading back:
> it watches what you delegate across **all** your agents, models which of *your*
> skills are decaying, and weaves tiny, well-timed practice into your real work.

This repo is **Layer 1 + Layer 2** of the architecture in [`spotter.md`](./spotter.md)
§6 — the deterministic observation layer and the in-loop MCP server. Layer 3 (the
menu-bar tray app: wait-cards, the Veil, the Mirror window) renders on top of this
service and is **not** in this repo yet — see *Scope & flags* below.

```
Claude Code ──hooks / transcripts──┐
Gemini CLI  ──transcripts──────────┤     Spotter local service
Codex CLI   ──transcripts──────────┼──►  ├─ tagger · O*NET charter · FSRS · SQLite
(any agent) ──POST /event──────────┘     ├─ MCP server: streamable HTTP @ localhost:7777
     ▲                                    │  (+ stdio shim)
     └──── MCP tools & practice directives┘  events · directives · grading · ledger
```

## Quick start

```bash
npm install
npm run build          # or use tsx directly (below)

# Load the demo replay corpus (multi-agent fixtures) into the ledger:
npx tsx src/cli.ts seed

# See what it found:
npx tsx src/cli.ts mirror       # the Delegation Mirror ("Spotify Wrapped")
npx tsx src/cli.ts ledger       # full skill ledger with retention + half-life
npx tsx src/cli.ts charter      # inferred role + protected watchlist

# Start the MCP server (streamable HTTP on 127.0.0.1:7777):
npx tsx src/cli.ts serve
#   health: http://127.0.0.1:7777/health
```

> **Native module note:** `better-sqlite3` ships a prebuilt binary. On very new Node
> versions run `npm rebuild better-sqlite3` once (needs Xcode CLT on macOS).

## Connecting your agents

All three point at the **same** local service, so the ledger is unified cross-agent.

**Claude Code** (HTTP MCP + deterministic hook — the frictionless one-liner):
```bash
claude mcp add --transport http spotter http://127.0.0.1:7777/mcp
```
For deterministic observation that doesn't depend on the model calling a tool, also
merge [`hooks/claude-code-settings.json`](./hooks/claude-code-settings.json) into
`~/.claude/settings.json` (registers a `UserPromptSubmit` hook → `POST /event`).

**Gemini CLI** — `~/.gemini/settings.json`:
```json
{ "mcpServers": { "spotter": { "httpUrl": "http://127.0.0.1:7777/mcp" } } }
```

**Codex CLI** — `~/.codex/config.toml` (uses the stdio shim):
```toml
[mcp_servers.spotter]
command = "npx"
args = ["tsx", "/Users/sanskritiuma/Spotter/src/cli.ts", "serve", "--stdio"]
```

## The MCP tool surface (Layer 2)

| Tool | Purpose |
|---|---|
| `task_started(description)` | Record a delegated task (decay signal); returns tagged skill + taskId |
| `task_completed(solution, reasoning, task_id?)` | Attach the solution to the ledger |
| `get_practice_directive(task_context)` | Return plain-language instructions to weave ONE rep into the deliverable — a `TODO(you):` gap, predict-then-reveal, endgame handoff, etc. — or `surface:"none"` |
| `grade_attempt(user_answer, reference?, confidence?)` | Reference-based grading; returns FSRS grade + a one-line delta + updated retention |
| `get_skill_ledger()` | Every tracked skill: status, retention %, half-life, calibration |
| `get_delegation_mirror(window_days?)` | The screenshot-ready "you delegated 86% of your SQL" view |
| `update_charter(skill_id, action)` | User override: `protect` / `watch` / `letgo` / `ignore` (absolute) |

The server's MCP `instructions` field (see `src/mcp/instructions.ts`) tells each host
*when* to call *what* — the standard lever for shaping invocation.

## How it works (mapped to the theory)

- **Tagger** (`core/tagger.ts`) — classifies each task into a skill. Keyword-anchored
  and deterministic today; async LLM hook (`tagWith`) for the bottom-up clustering in
  spotter.md §4.2.1.
- **Auto-charter** (`core/charter.ts`) — infers your role, maps skills onto an O*NET
  importance **prior**, crosses importance × delegation into the §4.2 status matrix,
  ranks by protection score, surfaces only the top N±2. Zero questionnaires.
- **Scheduler** (`core/scheduler.ts`) — per-skill FSRS forgetting curve (via `ts-fsrs`,
  population priors so it works from rep #0). Delegation = decay signal (no review);
  practice = an FSRS review. Plus Elo difficulty + Brier calibration (§5 Loop 1).
- **Directives** (`core/directives.ts` + `data/pedagogy.json`) — pedagogy as editable
  data, so any agent can execute a directive and the nightly Reflector (§5 Loop 3) can
  rewrite it. Retention-tiered surface choice stands in for the §5 Loop 2 bandit.
- **Grader** (`core/grader.ts`) — reference-based, so small/local models suffice.
- **Mirror** (`core/mirror.ts`) — the Delegation Mirror stats + headline.

Everything is **on-device**: one SQLite file at `~/.spotter/spotter.db`.

## Scope & flags (what's real, what's next)

Built and validated here:
- ✅ MCP server over **streamable HTTP** and a **stdio shim** — validated with a real MCP client.
- ✅ Full tool surface, FSRS curves, auto-charter, Mirror, reference grading.
- ✅ **Claude Code** transcript adapter — validated against a live install on this machine.
- ✅ Deterministic `/event` webhook + Claude Code hook script.

Flagged (see spotter.md §13 verification checklist):
- ⚠️ **Gemini CLI** adapter (Google's CLI — hackathon sponsor) is built to the
  *documented* `~/.gemini/tmp/<hash>/logs.json` + checkpoint formats but is **not
  validated live** — Gemini CLI isn't installed on this machine. Ships with a fixture
  and is exercised end-to-end by `seed`. Confirm field names against a real install.
- ⚠️ **Codex CLI** adapter is built to the documented rollout format; `codex` is
  installed here but had written no session yet, so it's **unvalidated live** too.
- 🚧 **Layer 3 (tray app)** — wait-cards, the Veil, voice probes, menu-bar sparkline,
  screen-share suppression. These **cannot** live in an MCP server (MCP servers can't
  initiate, don't see the conversation, and rely on inconsistent tool-call compliance).
  The server is designed so the tray app can drive all of it. Not in this repo yet.
- 🚧 **Nightly Reflector** — pedagogy is stored as editable data so it *can* self-edit;
  the reflection job itself isn't built.
- 🚧 **Bandit** — Loop 2 is a deterministic retention-tiered policy for now.

## Dev

```bash
npx tsc --noEmit                        # typecheck
npx tsx scripts/smoke-client.mts        # real MCP client over HTTP (server must be up)
npx tsx scripts/smoke-stdio.mts         # real MCP client over stdio
```
