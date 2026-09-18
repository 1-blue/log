#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo 'Missing server-side .env' >&2
  exit 1
fi
if [[ "$(stat -c %a .env)" != 600 ]]; then
  echo 'Server-side .env must have mode 600' >&2
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
