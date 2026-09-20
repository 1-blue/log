#!/usr/bin/env bash
set -euo pipefail

workflow_id="${1:?workflow id is required}"
workflow_file="${2:-/opt/career-ops-n8n/workflows/career-analysis.json}"
service="${3:-n8n}"
compose=(docker compose --env-file .env -f compose.prod.yml)

test -f "$workflow_file"
"${compose[@]}" exec -T "$service" n8n import:workflow \
  --input="$workflow_file" \
  --activeState=fromJson
"${compose[@]}" exec -T "$service" n8n publish:workflow --id="$workflow_id"
"${compose[@]}" restart "$service"
"${compose[@]}" ps --status running "$service" | grep -q "$service"
