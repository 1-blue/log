#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
compose=(docker compose --env-file .env -f compose.prod.yml)
backup_dir="${N8N_BACKUP_DIR:-$PWD/backups}"
install -d -m 700 "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_backup="$backup_dir/n8n-$stamp.dump"
data_backup="$backup_dir/n8n-$stamp.data.tar.gz"
trap 'rm -f "$database_backup.tmp" "$data_backup.tmp"' EXIT

"${compose[@]}" exec -T postgres pg_dump -U n8n -d n8n -Fc > "$database_backup.tmp"
"${compose[@]}" exec -T postgres pg_restore --list < "$database_backup.tmp" > /dev/null
"${compose[@]}" exec -T n8n tar -C /home/node -cf - .n8n | gzip > "$data_backup.tmp"
gzip -t "$data_backup.tmp"
mv "$database_backup.tmp" "$database_backup"
mv "$data_backup.tmp" "$data_backup"
printf 'Backup created: %s and %s\n' "$database_backup" "$data_backup"
