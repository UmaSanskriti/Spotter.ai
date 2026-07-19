#!/usr/bin/env bash
# Spotter observer hook for Claude Code.
# Claude Code pipes the hook payload as JSON on stdin; we forward it to the relay and
# always exit 0 fast - the observer must never slow down or block the agent.
#
# Requires: SPOTTER_URL and SPOTTER_SESSION in the environment (see hooks/install.sh).

TYPE="${1:-PostToolUse}"

if [ -z "$SPOTTER_URL" ] || [ -z "$SPOTTER_SESSION" ]; then
  exit 0
fi

# Read the hook payload from stdin *before* backgrounding. If we background curl with
# `--data-binary @-` directly, the script exits and closes the stdin pipe before curl
# reads it - curl then posts an empty body, tool_name is lost, and every event is dropped.
PAYLOAD="$(cat)"

curl -s -m 3 -X POST \
  "$SPOTTER_URL/event?session=$SPOTTER_SESSION&type=$TYPE" \
  -H 'Content-Type: application/json' \
  --data-raw "$PAYLOAD" >/dev/null 2>&1 &

exit 0
