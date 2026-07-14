# Hetzner Staging Deployment

This folder contains the first Hetzner deployment pack for the Alistra spatial API and PostGIS stack.

Treat this as staging until Firebase token verification, backups, restore testing, and HTTPS are confirmed.

## 1. Create The VPS

Recommended starting point:

- Ubuntu LTS
- 2-4 vCPU
- 4-8 GB RAM
- 40 GB+ NVMe
- Hetzner backups enabled
- SSH key login

Do not expose PostgreSQL publicly.

## 2. Initial Server Setup

Copy the repository to the server, then run:

```bash
cd /opt/alistra-gis/server/deploy
sudo ./setup-ubuntu.sh
```

If you run the setup script before copying the repo, copy the repo afterward into:

```text
/opt/alistra-gis
```

## 3. Configure Environment

```bash
cd /opt/alistra-gis/server/deploy
cp .env.production.example .env.production
nano .env.production
```

Set:

- `DOMAIN`
- `LETSENCRYPT_EMAIL`
- `CORS_ORIGIN`
- a long random `POSTGRES_PASSWORD`

## 4. First Boot Over HTTP

The default `nginx.conf` is HTTP-only so the API can start before certificates exist.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Check:

```bash
curl http://YOUR_SERVER_IP/api/health
```

## 5. Issue HTTPS Certificate

Point DNS for the API domain to the Hetzner server first.

```bash
source .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production --profile certbot run --rm certbot \
  certonly --webroot --webroot-path /var/www/certbot \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
  -d "$DOMAIN"
```

Then edit `nginx.https.conf` and replace every `api.example.com` with your real `$DOMAIN`.

```bash
cp nginx.https.conf nginx.conf
docker compose -f docker-compose.prod.yml --env-file .env.production restart nginx
```

Check:

```bash
curl https://YOUR_DOMAIN/api/health
```

## 6. Backups

Create a manual backup:

```bash
./backup-postgres.sh
```

Restore test:

```bash
./restore-postgres.sh backups/YOUR_BACKUP.sql.gz
```

Use cron or a systemd timer for daily backups once staging is stable. A backup that has not been restored is not proven.

## 7. Frontend Staging Flags

Use these for a staging frontend build:

```text
VITE_SPATIAL_API_ENABLED=true
VITE_SPATIAL_API_URL=https://YOUR_DOMAIN
```

Firestore remains the source of truth. The spatial API is still read-only from the frontend.

## Security Notes

- Public ports: `80`, `443`, restricted SSH only.
- PostgreSQL is only on the internal Docker network.
- Firebase ID token verification is still required before exposing real customer data.
- Keep Hetzner backups enabled while also taking PostgreSQL dumps.
- Do not add PostGIS write endpoints until a sync/conflict strategy is approved.
