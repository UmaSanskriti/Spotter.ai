#!/usr/bin/env bash
# Fires a realistic agent-session event sequence at a live Spotter session.
# Use this to rehearse the live pipeline (Gemini filter included) without running a real agent.
#   bash scripts/simulate.sh <SPOTTER_URL> <SESSION_ID>
set -euo pipefail

URL="${1:?usage: simulate.sh <url> <session-id>}"
SID="${2:?usage: simulate.sh <url> <session-id>}"

post() { # $1=type $2=json
  curl -s -X POST "$URL/event?session=$SID&type=$1" \
    -H 'Content-Type: application/json' -d "$2" >/dev/null
  echo "→ $3"
}

post PostToolUse '{"tool_name":"Read","tool_input":{"file_path":"package.json"}}' "Read package.json (should be silent)"
sleep 1
post PostToolUse '{"tool_name":"Grep","tool_input":{"pattern":"router"}}' "Grep (silent)"
sleep 1
post PostToolUse '{"tool_name":"Write","tool_input":{"file_path":"src/webhooks.js","content":"// Acknowledge immediately, enqueue for async processing.\n// Stripe retries on slow responses, so we never process inline.\napp.post(\"/webhook\", (req,res)=>{ verifySig(req); queue.add(req.body); res.sendStatus(200); })"}}' "Write webhooks.js — queue-over-inline decision"
sleep 8
post PostToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/webhooks.js","new_string":"const sig = req.headers[\"stripe-signature\"];\n// HMAC must be verified against the RAW body, before any JSON parsing\nstripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);"}}' "Edit — raw-body HMAC verification"
sleep 8
post PostToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' "npm test"
sleep 2
post PostToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/queue.js","new_string":"// exponential backoff with full jitter to avoid thundering-herd retries\nconst delay = Math.random() * Math.min(30000, 1000 * 2 ** attempt);"}}' "Edit — backoff with jitter"
sleep 8
post Stop '{"summary":"Built webhook ingestion: immediate ack + queue, raw-body HMAC verification, retries with exponential backoff and jitter, idempotency via unique event-id constraint, DLQ after max retries. All tests passing."}' "Stop — session summary"

echo "done — watch the session page. Expect ~2-3 cards (90s budget gates the rest)."
