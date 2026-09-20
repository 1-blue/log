#!/usr/bin/env bash
set -euo pipefail

workflow_id="${1:?workflow id is required}"
workflow_file="${2:-$PWD/workflows/career-analysis.json}"
service="${3:-n8n}"
compose=(docker compose --env-file .env -f compose.prod.yml)

test -f "$workflow_file"
workflow_name="$(basename "$workflow_file")"
workflow_container_file="/workflows/$workflow_name"
test "$workflow_name" = "career-analysis.json"
"${compose[@]}" exec -T "$service" n8n import:workflow \
  --input="$workflow_container_file"
"${compose[@]}" exec -T "$service" n8n publish:workflow --id="$workflow_id"
"${compose[@]}" restart "$service"
"${compose[@]}" exec -T "$service" wget --spider --quiet http://127.0.0.1:5678/healthz/readiness
"${compose[@]}" ps --status running "$service" | grep -q "$service"
