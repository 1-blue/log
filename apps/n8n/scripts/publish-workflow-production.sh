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
existing_file="/tmp/career-analysis-before-publication.json"
prepared_file="/tmp/career-analysis-publication.json"
helper_file="/tmp/prepare-workflow-publication.mjs"
"${compose[@]}" exec -T "$service" n8n export:workflow \
  --id="$workflow_id" --output="$existing_file"
"${compose[@]}" cp scripts/prepare-workflow-publication.mjs "$service:$helper_file"
"${compose[@]}" exec -T "$service" node "$helper_file" \
  "$workflow_container_file" "$existing_file" "$prepared_file" "$workflow_id"
"${compose[@]}" exec -T "$service" n8n import:workflow \
  --input="$prepared_file"
"${compose[@]}" exec -T "$service" n8n publish:workflow --id="$workflow_id"
"${compose[@]}" restart "$service"
if ! "${compose[@]}" up -d --wait --wait-timeout 180 "$service"; then
  echo 'n8n did not become healthy after restart' >&2
  "${compose[@]}" ps "$service" >&2 || true
  exit 1
fi
"${compose[@]}" exec -T "$service" wget --spider --quiet http://127.0.0.1:5678/healthz/readiness
"${compose[@]}" ps --status running "$service" | grep -q "$service"
