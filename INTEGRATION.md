# Spotter - Integration & Team Guide

How the terminal (a real Claude Code session) connects to our app, what data flows where,
and what each of us needs to know to build on it without breaking the pipe.

Read this if you're working on the **UI**, the **filter/agent**, or **running the demo**.

---

## 1. The one-paragraph mental model

A developer codes with **Claude Code in their terminal**. A one-line **hook** fires on every tool
use and POSTs the event to our server. The server **pre-filters** the noise, asks **Gemini** "is this
a decision worth teaching, and is it above this user's level?", and pushes the survivors - **cards** -
to any open UI over **Server-Sent Events (SSE)**. The terminal is never modified; the hook is
deterministic, so we can't miss events.

```
Terminal (Claude Code)                         Our server (server/index.js)              UI
──────────────────────                         ────────────────────────────             ──────────────
 tool use (Write/Edit/Bash)
   │  PostToolUse / Stop hook
   ▼
 ~/.spotter/spotter-hook.sh  ──curl POST──►  /event?session=<id>&type=PostToolUse
                                                 │
                                                 ├─ prefilter.js   (drop Reads/Greps/etc - ~80%)
                                                 ├─ filter.js      (Gemini: surface? importance? level?)
                                                 └─ store.addCard  ──SSE 'card'──►  session.html / live.html
```

There's also a **built-in agent** (`/agent/chat`) that plays the role of the terminal for the
self-contained `live.html` demo - same cards, same store, no Claude Code needed. See §6.

---

## 2. Run it / demo it (copy-paste)

**Window A - server** (needs a Gemini key or no cards fire):
```bash
cd Spotter.ai
npm install
export GEMINI_API_KEY=YOUR_KEY          # https://aistudio.google.com/apikey
export SPOTTER_CARD_BUDGET_MS=8000       # cards can surface ~every 8s (default is 90s)
npm start                                # http://localhost:8080
```

**Browser** - open `http://localhost:8080`, click **"Wire up my own agent (hooks)"**, copy the
**session id** (e.g. `9b475b8d`). Open the clean live view on your second screen:
`http://localhost:8080/session.html?id=<SESSION>`

**Window B - the terminal you demo:**
```bash
mkdir -p ~/spotter-demo && cd ~/spotter-demo
SPOTTER_URL=http://localhost:8080 SPOTTER_SESSION=<SESSION> bash /path/to/Spotter.ai/hooks/install.sh
claude
# then give it a decision-rich task (webhooks, retries, auth, dedupe, concurrency…)
```

**Pre-flight without Claude Code** (proves the whole pipe in ~30s):
```bash
bash scripts/simulate.sh http://localhost:8080 <SESSION>
```

---

## 3. Hooks: how the terminal is wired

`hooks/install.sh` writes **`<project>/.claude/settings.json`** with `PostToolUse` + `Stop` hooks and
copies the forwarder to `~/.spotter/spotter-hook.sh` (+ `~/.spotter/env` with `SPOTTER_URL` /
`SPOTTER_SESSION`).

- **Hooks are per-project.** They fire only when you run `claude` in the directory that has
  `.claude/settings.json`. To make them fire for *every* project, put the same block in
  `~/.claude/settings.json` (user-global).
- **No restart needed.** Claude Code re-reads the hook command on every tool call (file-watched
  settings). Editing `~/.spotter/spotter-hook.sh` takes effect on the next tool use.
- Verify with `/hooks` inside Claude Code - you should see `PostToolUse` and `Stop`.

> ⚠️ **The hook must read stdin before backgrounding curl.** Claude Code pipes the event JSON on
> stdin. If you background `curl --data-binary @- &` directly, the script exits and closes the pipe
> before curl reads it → curl POSTs an **empty body** → `tool_name` is undefined → the pre-filter
> drops *every* event. Symptom: `seen` climbs but `kept` stays flat and no cards ever appear. The
> fix (already in `spotter-hook.sh`) is `PAYLOAD="$(cat)"` first, then `curl --data-raw "$PAYLOAD" &`.
> **Don't reintroduce this.**

---

## 4. Data contracts (UI folks: build against these)

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/session` | create a session → `{ id, joinUrl }` |
| `GET`  | `/session/:id/state` | `{ id, eventsSeen, eventsKept, cardsSurfaced, profile }` |
| `GET`  | `/session/:id/stream` | **SSE** - the live feed the UI subscribes to |
| `GET`  | `/session/:id/events?since=N` | polling alternative (Android): `{ state, cards }` |
| `GET`  | `/session/:id/qr` | PNG QR to the join URL |
| `POST` | `/event?session=:id&type=PostToolUse\|Stop` | ingest (hooks / MCP post here) |
| `POST` | `/agent/chat?session=:id` | built-in agent for `live.html` → `{ reply, cards, live }` |
| `POST` | `/session/:id/answer` | `{ domain, gotIt }` → profile progress / level-up |
| `GET`  | `/demo` | recorded replay JSON |

### SSE messages (`GET /session/:id/stream`)
```jsonc
{ "type": "hello",   "state": {…}, "cards": [ …existing ] }   // sent once on connect
{ "type": "tick",    "tool": "Write", "state": {…} }          // an action happened
{ "type": "card",    "card": {…}, "state": {…} }              // a new card surfaced  ← render this
{ "type": "levelup", "domain": "security", "level": 2, "state": {…} }
```

### The Card object (the thing the UI renders - **don't rename these fields**)
```jsonc
{
  "seq": 2,                       // 1-based order in the session
  "at": 1721400000000,            // ms timestamp
  "domain": "systems-design",     // one of the profile domains
  "importance": 4,                // 1–5
  "above_user_level": true,
  "surface": true,
  "headline": "Robust sequence-number deduplication",   // ≤10 words, the decision
  "what_happened": "…",           // one plain sentence
  "why_it_matters": "…",          // the underlying principle, ≤2 sentences
  "question": "…",                // one retrieval question
  "answer": "…"                   // reference answer, revealed after the user thinks
}
```
This shape is produced by **both** `filter.js` (hook path) and `agent.js` (built-in agent), so any UI
that renders it works for both surfaces. Reference renderers: `public/session.html` (SSE) and
`public/live.html` (side-by-side).

### The profile / state
```jsonc
{ "eventsSeen": 12, "eventsKept": 3, "cardsSurfaced": 2,
  "profile": { "async-and-queues": 1, "databases": 2, "security": 1, "systems-design": 1,
               "testing": 2, "devops-and-deploy": 1, "frontend": 2, "algorithms": 2 } }
```
- **seen** = every hook event. **kept** = survived the pre-filter. **cardsSurfaced** = Gemini surfaced it.
- Diagnostic rule of thumb: *seen climbing but kept flat* = events being dropped (empty body or all
  Reads). *kept climbing but cards flat* = Gemini judging them not worth surfacing (that's fine).

---

## 5. What matters / gotchas

1. **`GEMINI_API_KEY` is required for cards.** Without it: the replay (`?mode=replay`) and the
   scripted `live.html` still work, but the hook filter and live agent produce nothing.
2. **Cards lag actions ~5–8s** - that's the Gemini call. It's not instant; don't assume it's broken.
3. **Not every edit surfaces**, by design. Boilerplate stays silent; real tradeoffs surface. *The
   filter, not the feed.*
4. **`SPOTTER_CARD_BUDGET_MS`** paces cards (default 90000 = ~1/90s). Lower it (e.g. `8000`) for a
   livelier live demo.
5. **Model** defaults to `gemini-2.5-flash` for both the agent and the filter; override with
   `SPOTTER_MODEL`.
6. **State is in-memory** (single process). Restarting the server drops sessions; the replay is
   seeded from `server/demo-session.json` so it always works cold.

---

## 6. Two agent surfaces, one brain (so nobody duplicates work)

- **Real terminal** → `hooks/` → `/event` → `prefilter.js` + `filter.js`. Use for the "it's really
  reading my Claude session" moment.
- **Built-in agent** → `public/live.html` → `/agent/chat` → `server/agent.js`. A Gemini coding agent
  that writes code **and** self-reports its decisions as cards; falls back to a scripted agent with
  no key. Use for the self-contained side-by-side demo that can't break on stage.

Both funnel through `store.addCard` → the same SSE stream, so **UI work applies to both**.

---

## 7. Who owns what (suggested)

- **UI** (`public/*`): render the Card + state from the SSE stream; nothing else needs to change to
  get live data. Add polish freely - just keep the field names above.
- **Filter/agent** (`server/filter.js`, `server/agent.js`): the pedagogy and surfacing rules.
- **Adapters** (`hooks/`, `mcp/`): getting events in from more agents (Gemini CLI, Codex, OpenClaw)
  is a ~30-line transcript parser each.

Deploy targets and the pitch/demo script live in [README.md](README.md). The learning-science
rationale for every mechanic is in [spotter.md](spotter.md).
