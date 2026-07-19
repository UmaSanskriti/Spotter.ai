#!/usr/bin/env bash
# Wires Spotter into Claude Code for the current project.
# Usage:  SPOTTER_URL=https://<your-cloud-run-url> SPOTTER_SESSION=<id> bash hooks/install.sh
set -euo pipefail

if [ -z "${SPOTTER_URL:-}" ] || [ -z "${SPOTTER_SESSION:-}" ]; then
  echo "Set SPOTTER_URL and SPOTTER_SESSION first (shown on the session page)." >&2
  exit 1
fi

HOOK_DIR="$HOME/.spotter"
mkdir -p "$HOOK_DIR"
cp "$(dirname "$0")/spotter-hook.sh" "$HOOK_DIR/spotter-hook.sh"
chmod +x "$HOOK_DIR/spotter-hook.sh"

# Persist env for the hook (Claude Code runs hooks in a fresh shell).
cat > "$HOOK_DIR/env" <<EOF
export SPOTTER_URL="$SPOTTER_URL"
export SPOTTER_SESSION="$SPOTTER_SESSION"
EOF

SETTINGS_DIR=".claude"
SETTINGS="$SETTINGS_DIR/settings.json"
mkdir -p "$SETTINGS_DIR"

if [ -f "$SETTINGS" ]; then
  echo "⚠ $SETTINGS already exists - merge this hooks block in manually:"
else
  cat > "$SETTINGS" <<'EOF'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": ". ~/.spotter/env && ~/.spotter/spotter-hook.sh PostToolUse" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": ". ~/.spotter/env && ~/.spotter/spotter-hook.sh Stop" }
        ]
      }
    ]
  }
}
EOF
  echo "✓ Wrote $SETTINGS"
fi

cat <<EOF

Spotter wired. Start a Claude Code session in this project and watch
$SPOTTER_URL/session.html?id=$SPOTTER_SESSION
EOF
