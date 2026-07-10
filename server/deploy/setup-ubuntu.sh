#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on a fresh Ubuntu LTS server." >&2
  exit 1
fi

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  git \
  ufw \
  unattended-upgrades \
  docker.io

if apt-cache show docker-compose-plugin >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
elif apt-cache show docker-compose-v2 >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2
else
  echo "No Docker Compose v2 package found in apt repositories." >&2
  echo "Install Docker Compose manually, then re-run this script." >&2
  exit 1
fi

systemctl enable --now docker
systemctl enable --now unattended-upgrades

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG docker deploy
fi

mkdir -p /opt/alistra-gis
chown deploy:deploy /opt/alistra-gis

echo "Base server setup complete."
echo "Next: copy the repo to /opt/alistra-gis, create server/deploy/.env.production, and run docker compose."
