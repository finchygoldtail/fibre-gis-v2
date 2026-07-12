# Hetzner Migration Runbook

This is the working checklist for moving Alistra GIS map loading from browser/Firebase-heavy rendering toward Hetzner/PostGIS.

## Current State

- Firebase/Firestore remains the write source of truth.
- Hetzner/PostGIS is live as a read-only spatial map engine.
- BAS has been imported and verified through `/api/assets`.
- The frontend can show Firebase/local assets and Hetzner/PostGIS assets separately.

## Migration Order

### 1. Prove Visual Separation

Goal: make sure users can tell which system is drawing which assets.

- Enable `VITE_SPATIAL_API_ENABLED=true`.
- Use the map source controls:
  - Firebase / local assets
  - Hetzner / PostGIS assets
  - Highlight PostGIS
- Confirm PostGIS assets remain read-only in the UI.

### 2. Protect The Database

Goal: no real import happens without a backup path.

On Hetzner:

```bash
cd /opt/alistra-gis/server/deploy
./backup-postgres.sh
./restore-postgres.sh backups/YOUR_BACKUP.sql.gz
sudo ./install-backup-timer.sh
systemctl list-timers alistra-postgres-backup.timer
```

Keep Hetzner provider backups enabled as a second layer. A backup is not trusted until a restore has been tested.

### 3. Import Areas One At A Time

Goal: repeatable imports with counts checked before writing.

Upload an export to:

```text
/opt/alistra-gis/server/imports/
```

Dry run:

```bash
cd /opt/alistra-gis/server/deploy
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
  npm run db:import:geojson -- \
  --file /app/imports/AREA.geojson \
  --business-id fibre-gis-v2 \
  --area-id AREA-CODE \
  --source area-export \
  --dry-run
```

Import:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
  npm run db:import:geojson -- \
  --file /app/imports/AREA.geojson \
  --business-id fibre-gis-v2 \
  --area-id AREA-CODE \
  --source area-export
```

After import:

```bash
curl "http://65.108.158.104/api/assets/stats?businessId=fibre-gis-v2"
```

### 4. HTTPS And Domain

Goal: stop using the raw server IP in frontend config.

- Point an API domain at the Hetzner IPv4 address.
- Issue LetsEncrypt certs with the existing certbot profile.
- Switch nginx to `nginx.https.conf`.
- Set frontend:

```text
VITE_SPATIAL_API_URL=https://YOUR_API_DOMAIN
```

### 5. Authentication

Goal: do not expose real customer data to anonymous API requests.

- Replace the auth middleware stub with Firebase ID token verification.
- Require auth on `/api/assets` and `/api/assets/stats`.
- Keep PostGIS private on the Docker network.
- Frontend requests send the signed-in Firebase user's ID token.
- Server enforcement is controlled by:

```text
REQUIRE_FIREBASE_AUTH=true
FIREBASE_PROJECT_ID=fibre-gis-v2
```

Test with auth off first, then enable it and confirm the map still loads.

### 6. Source Of Truth Decision

Goal: choose how edits move into PostGIS.

Allowed staging mode:

- Firestore is writable.
- PostGIS is read-only from the browser.
- Imports/sync jobs refresh PostGIS.

Future production choices:

- Scheduled Firestore-to-PostGIS sync job.
- Admin import screen with dry-run counts.
- Full write API with conflict handling.

Do not make PostGIS the only source of truth until write sync, audit logs, backups, auth, and restore testing are all proven.
