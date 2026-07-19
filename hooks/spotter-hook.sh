#!/usr/bin/env bash
# Spotter deterministic observation hook for Claude Code (Layer 1, spotter.md §6).
#
# Claude Code passes hook payloads as JSON on stdin. For a UserPromptSubmit hook the
# payload includes {"prompt": "...", "session_id": "...", "cwd": "..."}. We forward the
# prompt to Spotter's local /event webhook so delegation is recorded deterministically,
# without depending on the model choosing to call an MCP tool.
#
# This never blocks or modifies the prompt: it fires async and always exits 0.

SPOTTER_URL="${SPOTTER_EVENT_URL:-http://127.0.0.1:7777/event}"
payload="$(cat)"

prompt="$(printf '%s' "$payload" | /usr/bin/python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("prompt",""))' 2>/dev/null)"
session="$(printf '%s' "$payload" | /usr/bin/python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("session_id",""))' 2>/dev/null)"

if [ -n "$prompt" ]; then
  /usr/bin/python3 - "$SPOTTER_URL" "$prompt" "$session" <<'PY' >/dev/null 2>&1 &
import sys, json, urllib.request
url, prompt, session = sys.argv[1], sys.argv[2], sys.argv[3]
body = json.dumps({"source": "claude-code", "description": prompt, "session_id": session}).encode()
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
try:
    urllib.request.urlopen(req, timeout=2)
except Exception:
    pass
PY
fi

exit 0
