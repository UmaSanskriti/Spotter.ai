# Spotter

**Your AI agent does the work. Spotter makes sure you still learn from it.**

Spotter observes your coding agent's session in real time, decides which of its decisions are
worth *you* understanding, and streams those — and only those — to a second screen (your phone
or a split-screen monitor) while the agent grinds.

The insight: long agentic sessions are dead air for the human. That's the only moment where
learning costs zero productivity, because the alternative was watching a spinner. The agent
made 47 moves; you see 5 cards. **The filter, not the feed. Silence is a feature.**

Built at the Stanford × Google DeepMind Hackathon, July 2026. Powered by Gemini.

## Architecture

```
Claude Code (laptop)
   │  hooks: PostToolUse, Stop  ── deterministic, no model goodwill
   ▼
POST /event  ──►  Cloud Run (this service)
                     ├─ stage 1: cheap pre-filter (kills ~80% of events)
                     ├─ stage 2: Gemini — "does this matter, and is it above
                     │            this user's level?"  ◄── user profile
                     └─ surfaced cards
                            ├──► web client (SSE)          second monitor
                            └──► GET /session/:id/events   Android (polling)
```

- **Hooks, not MCP, do the observing** for Claude Code — deterministic shell callbacks that
  can't miss events. A thin stdio **MCP server** (`mcp/server.js`) is the agent-agnostic
  surface for everything else.
- **The Spotter Filter** (`server/prefilter.js` + `server/filter.js`) is the product: per
  decision, Gemini judges importance and whether it's above the user's current level in that
  domain. Below your level → silence.
- **Profile**: 6–8 domains, level 1–3. Three understood cards in a domain levels it up.
  (Profile today, knowledge graph next.)
- **Replay mode** (`/session.html?mode=replay`) plays a recorded session — the artifact
  anyone can open cold, and the on-stage fallback.

## Run locally

```bash
npm install
GEMINI_API_KEY=your-key npm start     # key optional — replay works without it
# open http://localhost:8080
```

## Deploy

```bash
GEMINI_API_KEY=your-key bash deploy.sh your-gcp-project
```

## Wire up your agent

1. Open the deployed app → **Start your own session** → note the session id / QR.
2. In the repo your agent works on:
   ```bash
   SPOTTER_URL=https://<cloud-run-url> SPOTTER_SESSION=<id> bash hooks/install.sh
   ```
3. Scan the QR with your phone. Run your Claude Code task. Cards land on the phone.

For non-Claude agents, point any MCP client at `mcp/server.js` with the same two env vars.

## Env

| var | default | |
|---|---|---|
| `GEMINI_API_KEY` | — | enables the live filter |
| `SPOTTER_MODEL` | `gemini-3.1-pro` | filter model |
| `SPOTTER_CARD_BUDGET_MS` | `90000` | max one card per this window |
| `PORT` | `8080` | |
