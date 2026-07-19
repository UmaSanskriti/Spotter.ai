#!/usr/bin/env bash
# Deploy Spotter to Cloud Run.
#   GEMINI_API_KEY=... bash deploy.sh [project-id]
# max-instances=1 because the session store is in-memory — one instance, one truth.
set -euo pipefail

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"

gcloud run deploy spotter \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:-}" \
  --quiet

echo
echo "✓ Deployed. Open the URL above in an incognito window on a phone and hit ▶ Watch a live session."
