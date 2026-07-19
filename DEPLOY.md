# Deploying Spotter to a public URL (Google AI Studio / Cloud Run)

No terminal needed for the deploy itself. The **only** terminal step in the whole product is
wiring your coding agent's hook (that's the integration — see the end).

## Import → deploy (UI only)

1. **Point the deploy at this repo, branch `main`.** `main` has the current build (the older
   deploys that showed no cards were stale — always deploy `main`).
2. **Set the Gemini API key.** In the deploy's environment/secrets, add your key. The server
   accepts **any** of these names, so use whichever the UI gives you — they all work:
   `API_KEY` (AI Studio's default), `GEMINI_API_KEY`, or `GOOGLE_API_KEY`.
   Get a key at https://aistudio.google.com/apikey.
3. **Set max instances = 1.** Sessions live in memory, so all requests must hit one instance.
   In the Cloud Run console: *Edit & Deploy New Revision → Container → "Maximum number of
   instances" → 1*. (One-time UI setting; skip it and cards can vanish under scale.)
4. **Deploy.**

The repo already ships a `Dockerfile` (Node 20, `node server/index.js`, binds `$PORT`), so the
build is automatic — nothing else to configure.

## Verify in 5 seconds

Open **`https://<your-url>/healthz`**. You want:
```json
{ "geminiKeySet": true, "model": "gemini-2.5-flash", "lastError": null }
```
- `geminiKeySet: false` → the key env var didn't stick (step 2).
- a **404** page → the deploy isn't running `main` (redeploy from `main`).
- `lastError` non-null → the model call failed; the message says why.

Then open `https://<your-url>/` and try **⚡ Try it live** — the side-by-side demo needs zero setup.

## The only terminal step: wire a real agent (the integration)

This is inherent to the product — it's how Spotter observes your *actual* coding session.

1. On the app, **"Wire up my own agent"** → copy the **session id**.
2. In the project you'll code in:
   ```bash
   cd ~/your-project
   export SPOTTER_URL=https://<your-url>
   export SPOTTER_SESSION=<session-id>
   bash ~/path/to/Spotter.ai/hooks/install.sh
   claude
   ```
3. Open `https://<your-url>/session.html?id=<session-id>` on your second screen. Code. Cards land
   ~5–8s after each edit.

See [INTEGRATION.md](INTEGRATION.md) for how the hook → server → card pipe works and the data
contracts, and [README.md](README.md) for the demo script.
