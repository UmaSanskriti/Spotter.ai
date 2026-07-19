# Spotter

**Your AI agent does the work. Spotter makes sure you still learn from it.**

Spotter watches your coding agent's session in real time, decides which of its decisions are
worth *you* understanding, and streams those — and only those — to a second screen (your phone
or a split-screen monitor) while the agent grinds.

The insight: long agentic sessions are dead air for the human. That's the only moment where
learning costs zero productivity, because the alternative was watching a spinner. The agent
made 47 moves; you see 5 cards. **The filter, not the feed. Silence is a feature.**

Built at the Stanford × Google DeepMind Hackathon, July 2026. Powered by Gemini.

---

## Three ways to see it (no setup)

Open the app and pick one:

1. **⚡ Try it live — `/live.html`**  ← *the demo.* Chat with a built-in coding agent on the left;
   Spotter surfaces the learning cards on the right, in the same screen. Works with or without a
   Gemini key (scripted fallback), so it can't break on stage.
2. **▶ Watch a recorded session — `/session.html?mode=replay`.** A real 62-second agent session
   (Stripe webhook service) plays back: 47 actions, 5 cards. The artifact any judge can open cold.
3. **Wire up your own agent (hooks).** Install a one-line Claude Code hook and Spotter observes a
   *real* Claude Code session, streaming cards to your phone via QR.

---

## Architecture

```
    LEFT (delegate)                     RIGHT (learn)
┌────────────────────┐         ┌──────────────────────────┐
│ built-in agent     │  cards  │  Spotter phone / 2nd     │
│  /agent/chat  ─────┼────────►│  screen  (SSE + HTTP)    │
│  (Gemini)          │         │                          │
└────────────────────┘         └──────────────────────────┘
        ▲  same session store, same surfacing rule  ▲
        │                                           │
   real Claude Code ──hooks: PostToolUse, Stop──► POST /event
                                                     ├─ stage 1: cheap pre-filter (kills ~80%)
                                                     ├─ stage 2: Gemini — "does this matter, and
                                                     │            is it above this user's level?"
                                                     └─ surfaced cards ──► SSE / polling
```

- **Two agent surfaces, one brain.** The **built-in agent** (`server/agent.js`) powers the
  self-contained live demo. **Hooks** (`hooks/`) observe a *real* Claude Code session
  deterministically — no model goodwill needed. A thin stdio **MCP server** (`mcp/server.js`) is
  the agent-agnostic surface for any other MCP client. All three feed the same session store.
- **The Spotter Filter** (`server/prefilter.js` + `server/filter.js`) is the product: per decision,
  Gemini judges importance and whether it's above the user's current level. Below your level → silence.
- **Profile:** 6–8 domains, level 1–3. Three understood cards in a domain levels it up.
- The pedagogy (predict-then-reveal, retrieval practice, situated learning) is spelled out in
  [`spotter.md`](spotter.md).

---

## Run locally

```bash
npm install
npm start                       # http://localhost:8080  — offline demo works immediately
# for the live Gemini agent:
GEMINI_API_KEY=your-key npm start
```

Get a free key at **https://aistudio.google.com/apikey** (Google AI Studio).

---

## Deploy

### Option A — Replit (fastest, recommended for the demo)

1. Go to **replit.com → Create → Import from GitHub** and paste this repo URL
   (branch `yash`). Replit reads `.replit` and installs automatically.
2. Open the **Secrets** (🔒) panel and add: `GEMINI_API_KEY = your-key`.
   *(Skip this and the scripted offline demo still runs.)*
3. Press **Run**. Open the webview → `/live.html`.
4. To get a shareable public URL, click **Deploy** (Autoscale/Cloud Run target is preconfigured).

### Option B — Google Cloud Run

```bash
GEMINI_API_KEY=your-key bash deploy.sh your-gcp-project
```

> **Google AI Studio** is where you get the API key and can prototype prompts — it isn't a host for
> a full Node service. Use AI Studio for the key, Replit or Cloud Run to run the app.

---

## Wire up a real agent (optional — the "it's not a mock" moment)

1. Deploy, open the app → **Wire up my own agent** → note the session id / QR.
2. In the repo your agent works on:
   ```bash
   SPOTTER_URL=https://<your-url> SPOTTER_SESSION=<id> bash hooks/install.sh
   ```
3. Scan the QR with your phone. Run your Claude Code task. Cards land on the phone.

For non-Claude agents, point any MCP client at `mcp/server.js` with the same two env vars.

---

## Demo script (2 minutes, side-by-side)

1. Open **`/live.html`** full-screen. "Left is my AI agent. Right is my phone. I delegate; I still learn."
2. Click **↻ retry + backoff**. The agent writes the code on the left; a beat later a **card slides
   in on the right** — *"Retries use exponential backoff with jitter"* — with a question you answer
   before revealing.
3. Click **🔐 JWT auth**, then **🐢 fix N+1 query**. Counter ticks: *"8 actions · 3 worth learning."*
   "It's not dumping everything — it's the filter, not the feed."
4. Click **📱 open on my phone** → the same cards are on a real phone via SSE. "Second screen, live."
5. (Fallback / proof) Hit **▶ Watch a recorded session** — a real Claude Code session, 47 actions, 5 cards.

---

## Env

| var | default | |
|---|---|---|
| `GEMINI_API_KEY` | — | enables the live Gemini agent + filter; without it, scripted demo runs |
| `SPOTTER_MODEL` | `gemini-2.5-flash` | model for the agent and the filter |
| `SPOTTER_CARD_BUDGET_MS` | `90000` | hook pipeline: max one card per this window |
| `PORT` | `8080` | |
