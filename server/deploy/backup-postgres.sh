#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.production ]; then
  echo "Missing .env.production. Copy .env.production.example first." >&2
  exit 1
fi

set -a
source .env.production
set +a

mkdir -p backups

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="backups/${POSTGRES_DB}_${timestamp}.sql.gz"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "$backup_file"

echo "Backup written to ${backup_file}"

if [[ "$retention_days" =~ ^[0-9]+$ ]] && [ "$retention_days" -gt 0 ]; then
  find backups -type f -name "${POSTGRES_DB}_*.sql.gz" -mtime +"$retention_days" -print -delete
fi
