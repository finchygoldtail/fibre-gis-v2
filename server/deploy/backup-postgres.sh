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

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "$backup_file"

echo "Backup written to ${backup_file}"
