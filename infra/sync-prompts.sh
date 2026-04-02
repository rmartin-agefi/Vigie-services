#!/bin/bash
# Upload les prompts et data locaux vers GCS, puis rafraîchit le cache Cloud Run
# Usage : SERVICE_URL=https://... SERVICE_TOKEN=... ./infra/sync-prompts.sh

set -e

BUCKET="${GCS_BUCKET:-influence-prompts}"
GCS_PREFIX="influence-services"

echo "→ Upload prompts vers gs://${BUCKET}/${GCS_PREFIX}/prompts/"
gsutil -m rsync -r prompts/ "gs://${BUCKET}/${GCS_PREFIX}/prompts/"

echo "→ Upload data vers gs://${BUCKET}/${GCS_PREFIX}/data/"
gsutil -m rsync -r data/ "gs://${BUCKET}/${GCS_PREFIX}/data/"

if [ -n "$SERVICE_URL" ] && [ -n "$SERVICE_TOKEN" ]; then
  echo "→ Refresh cache Cloud Run..."
  curl -s -X POST "${SERVICE_URL}/admin/refresh" \
    -H "x-admin-token: ${SERVICE_TOKEN}" | jq .
else
  echo "⚠ SERVICE_URL ou SERVICE_TOKEN non défini — cache non rafraîchi"
fi

echo "✓ Done"
