#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ "$#" -ne 1 ]; then
  echo "Usage: ./restore-postgres.sh backups/alistra_gis_YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 1
fi

if [ ! -f .env.production ]; then
  echo "Missing .env.production. Copy .env.production.example first." >&2
  exit 1
fi

backup_file="$1"
if [ ! -f "$backup_file" ]; then
  echo "Backup not found: $backup_file" >&2
  exit 1
fi

set -a
source .env.production
set +a

echo "Restoring ${backup_file} into ${POSTGRES_DB}."
echo "This will overwrite database objects included in the dump."
read -r -p "Type RESTORE to continue: " confirmation

if [ "$confirmation" != "RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

gunzip -c "$backup_file" | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore complete."
