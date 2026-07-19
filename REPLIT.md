# Spotter - Replit Track submission runbook

End-to-end path from this repo to a hosted Replit submission. Total time: ~10 minutes.

## 1. Import (2 min)

1. Go to [replit.com/new](https://replit.com/new) and log in
2. Choose **Import from GitHub** and paste: `https://github.com/UmaSanskriti/Spotter.ai`
3. Replit reads `.replit` and `replit.nix` automatically (Node 20, `npm install && npm start`)

## 2. Secret (1 min)

In the Replit workspace: **Tools → Secrets** and add:

| key | value |
|---|---|
| `GEMINI_API_KEY` | your key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

The server also accepts `API_KEY` or `GOOGLE_API_KEY` if that's what you have.

## 3. Run and verify (2 min)

Press **Run**. The webview opens on the landing page. Verify in order:

- [ ] Landing page renders (light glass theme, two buttons)
- [ ] `/demo.html` plays end to end: terminal types, cards land, MCQs auto-answer,
      end screen appears with Re-watch / Get started / Sign in
- [ ] `/healthz` shows `"geminiKeySet": true`
- [ ] `/live.html`: send "add retry with backoff to my webhook", a real Gemini reply
      and a card appear (with no key it falls back to the scripted agent, still fine)
- [ ] `/onboard.html`: paste any resume text, profile generates, session starts

## 4. Deploy for a stable public URL (3 min)

The Run webview URL sleeps with the workspace. For judging, publish a deployment:

1. Click **Deploy** (top right) and pick **Autoscale**
2. Confirm run command `npm start`, add the same `GEMINI_API_KEY` secret to the deployment
3. Deploy; you get a stable `*.replit.app` URL

Open the `.replit.app` URL in an incognito window on a phone and re-run the
checklist above. That URL plus the Replit project link are the submission.

## 5. Submit by 2:30 PM sharp

- **Hosted prototype:** the `*.replit.app` URL
- **Code repository:** the Replit project link (this is the Replit-track requirement;
  the GitHub repo is a bonus)
- **One-pager and both videos:** shared with the main-track submission

## Notes for judges

- Gemini powers three surfaces: the Spotter Filter (per-decision "is this worth
  teaching this user"), the live coding agent in `/live.html`, and resume-to-profile
  in onboarding. Model fallback chain: `gemini-3.1-pro` → `gemini-flash-latest` →
  `gemini-2.5-flash`, first responder pinned.
- With no key set, every page still works: the demo is fully scripted and the live
  agent falls back to offline scenarios. The demo never depends on the network.
