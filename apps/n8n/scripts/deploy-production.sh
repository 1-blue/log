#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

publish_workflow_id=""
publish_workflow_file=""
if [[ "${1:-}" == "--publish-workflow" ]]; then
  publish_workflow_id="${2:?workflow id is required with --publish-workflow}"
  if [[ "${3:-}" != "" ]]; then
    publish_workflow_file="$3"
  else
    publish_workflow_file="$PWD/workflows/career-analysis.json"
  fi
fi
if [[ ! -f .env ]]; then
  echo 'Missing server-side .env' >&2
  exit 1
fi
if [[ "$(stat -c %a .env)" != 600 ]]; then
  echo 'Server-side .env must have mode 600' >&2
  exit 1
fi

n8n_public_url="$(sed -n 's/^N8N_PUBLIC_URL=//p' .env | tail -n 1)"
n8n_public_url="${n8n_public_url%$'\r'}"
case "$n8n_public_url" in
  https://*) ;;
  *) echo 'N8N_PUBLIC_URL must use HTTPS' >&2; exit 1 ;;
esac
if [[ "$n8n_public_url" == */ ]]; then
  echo 'N8N_PUBLIC_URL must not have a trailing slash' >&2
  exit 1
fi

compose=(docker compose --env-file .env -f compose.prod.yml)
"${compose[@]}" config --quiet

if docker volume inspect blog-career-ops-n8n_postgres_data > /dev/null 2>&1; then
  if [[ ! "$("${compose[@]}" ps -q postgres)" || ! "$("${compose[@]}" ps -q n8n)" ]]; then
    echo 'Existing data volume found but services are stopped; inspect and back up before deploying' >&2
    exit 1
  fi
  bash ./scripts/backup-production.sh
fi

"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" ps

if [[ -n "$publish_workflow_id" ]]; then
  bash ./scripts/publish-workflow-production.sh "$publish_workflow_id" "$publish_workflow_file"
fi
