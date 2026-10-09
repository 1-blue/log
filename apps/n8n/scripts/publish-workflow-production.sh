#!/usr/bin/env bash
set -euo pipefail
umask 077

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
verification_file="/tmp/verify-workflow-publication.mjs"
published_file="/tmp/career-analysis-after-publication-$$.json"
baseline_file="$PWD/.deployment-state/career-analysis-baseline.json"
if [[ ! -f "$baseline_file" ]]; then
  echo 'Missing previous deployed source; refusing to overwrite remote edits' >&2
  exit 1
fi
"${compose[@]}" exec -T "$service" n8n export:workflow \
  --id="$workflow_id" --output="$existing_file"
"${compose[@]}" cp scripts/prepare-workflow-publication.mjs "$service:$helper_file"
"${compose[@]}" cp scripts/verify-workflow-publication.mjs "$service:$verification_file"
"${compose[@]}" cp "$baseline_file" "$service:/tmp/career-analysis-baseline.json"
# compose cp creates root-owned files. Keep the baseline private while allowing
# the service's non-root runtime user to read it; never broaden file permissions.
runtime_uid="$("${compose[@]}" exec -T "$service" id -u)"
runtime_gid="$("${compose[@]}" exec -T "$service" id -g)"
if [[ ! "$runtime_uid" =~ ^[0-9]+$ || ! "$runtime_gid" =~ ^[0-9]+$ ]]; then
  echo 'Could not identify the n8n runtime owner' >&2
  exit 1
fi
"${compose[@]}" exec -T --user 0 "$service" chown \
  "$runtime_uid:$runtime_gid" "$helper_file" "$verification_file" /tmp/career-analysis-baseline.json
"${compose[@]}" exec -T "$service" node "$helper_file" \
  "$workflow_container_file" "$existing_file" "$prepared_file" "$workflow_id" /tmp/career-analysis-baseline.json
"${compose[@]}" exec -T "$service" n8n import:workflow \
  --input="$prepared_file"
"${compose[@]}" exec -T "$service" n8n publish:workflow --id="$workflow_id"
# The n8n CLI can log an error yet return zero; verify the resulting DB state.
"${compose[@]}" exec -T "$service" n8n export:workflow \
  --id="$workflow_id" --output="$published_file"
"${compose[@]}" exec -T "$service" node "$verification_file" \
  "$published_file" "$workflow_id" "$prepared_file"
"${compose[@]}" restart "$service"
if ! "${compose[@]}" up -d --wait --wait-timeout 180 "$service"; then
  echo 'n8n did not become healthy after restart' >&2
  "${compose[@]}" ps "$service" >&2 || true
  exit 1
fi
"${compose[@]}" exec -T "$service" wget --spider --quiet http://127.0.0.1:5678/healthz/readiness
"${compose[@]}" ps --status running "$service" | grep -q "$service"
"${compose[@]}" exec -T "$service" node "$verification_file" \
  --probe http://127.0.0.1:5678/webhook/career-analysis
install -m 600 "$workflow_file" "$baseline_file"
