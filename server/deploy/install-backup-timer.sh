#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the Hetzner server." >&2
  exit 1
fi

deploy_dir="$(cd "$(dirname "$0")" && pwd)"
service_path="/etc/systemd/system/alistra-postgres-backup.service"
timer_path="/etc/systemd/system/alistra-postgres-backup.timer"

cat > "$service_path" <<SERVICE
[Unit]
Description=Alistra PostGIS backup
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=${deploy_dir}
ExecStart=${deploy_dir}/backup-postgres.sh
SERVICE

cat > "$timer_path" <<TIMER
[Unit]
Description=Run Alistra PostGIS backup daily

[Timer]
OnCalendar=*-*-* 02:20:00 UTC
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now alistra-postgres-backup.timer

echo "Installed alistra-postgres-backup.timer."
echo "Check with: systemctl list-timers alistra-postgres-backup.timer"
