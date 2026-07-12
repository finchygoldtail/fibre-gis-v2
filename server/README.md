# Alistra Spatial API Phase 1

This workspace is the first isolated server-side foundation for Alistra GIS spatial loading.

It does not replace Firebase, Firestore, Firebase Storage, or the current production save/load flow. Phase 1 is read-only from the frontend and is intended for local or staging validation with PostGIS.

## Stack

- Node.js
- TypeScript
- Express
- PostgreSQL with PostGIS
- Docker Compose

## Local Setup

```bash
cd server
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

When running `npm run db:migrate`, `npm run db:seed`, or `npm run dev` directly from Windows/macOS/Linux, `DATABASE_URL` should use `localhost` because the scripts run on the host. The Docker API container overrides this internally to use the Compose hostname `postgres`.

To run API and PostGIS together in Docker:

```bash
cd server
cp .env.example .env
docker compose up --build
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime mode. |
| `API_HOST` | API bind host. Use `0.0.0.0` in Docker. |
| `API_PORT` | API port. Defaults to `3001`. |
| `CORS_ORIGIN` | Allowed frontend origin, usually `http://localhost:5173`. |
| `DATABASE_URL` | PostgreSQL connection string used by the API and scripts. |
| `POSTGRES_DB` | Docker Postgres database name. |
| `POSTGRES_USER` | Docker Postgres username. |
| `POSTGRES_PASSWORD` | Docker Postgres password. Use a real secret outside local development. |

Do not put database credentials in the React frontend.

## Migrations

Run:

```bash
npm run db:migrate
```

Current migration:

- `001_create_map_assets.sql`
- Enables `postgis`
- Creates `map_assets`
- Adds GiST geometry index
- Adds business, project, area, and asset type indexes

## Seed Data

Run:

```bash
npm run db:seed
```

The seed inserts:

- one DP in `BD-BAS-AG1`
- one pole in `BD-BAS-AG1`
- one chamber in `BD-BAS-AG1`
- one global core feeder cable with `area_id = NULL`

The global cable proves the API can return core-network assets that intersect the viewport without duplicating them per AG.

## Endpoints

### Health

```http
GET http://localhost:3001/api/health
```

Example response:

```json
{
  "status": "ok",
  "service": "alistra-api",
  "database": "connected"
}
```

### Bounding-box assets

```http
GET http://localhost:3001/api/assets?businessId=fibre-gis-v2&areaId=BD-BAS-AG1&assetTypes=dp,pole,chamber,feederCable&minLng=-1.80&minLat=53.82&maxLng=-1.76&maxLat=53.85&zoom=17&limit=100
```

Response shape:

```json
{
  "type": "FeatureCollection",
  "features": [],
  "meta": {
    "count": 0,
    "zoom": 17,
    "truncated": false,
    "limit": 100
  }
}
```

Supported query parameters:

- `businessId` required
- `projectId` optional
- `areaId` optional
- `assetTypes` optional comma-separated list
- `minLng`, `minLat`, `maxLng`, `maxLat` required
- `zoom` optional
- `limit` optional, capped at `10000`

When `areaId` is provided, the API returns matching area-owned assets plus global assets where `area_id IS NULL`, filtered by the same viewport bounds.

## Frontend Feature Flag

The frontend spatial API client exists under:

```text
src/services/spatialApi/
```

It is disabled by default.

```text
VITE_SPATIAL_API_ENABLED=false
VITE_SPATIAL_API_URL=http://localhost:3001
```

No current Firestore services are replaced by this client in Phase 1.

## Phase 2 Viewport Proof Of Concept

The map can now request read-only spatial API assets for the current Leaflet viewport when the frontend flag is enabled.

Add this to the frontend `.env.local` while testing:

```text
VITE_SPATIAL_API_ENABLED=true
VITE_SPATIAL_API_URL=http://localhost:3001
```

Then restart the Vite dev server.

The viewport loader:

- waits for map bounds and zoom
- debounces requests after map movement
- aborts superseded requests
- caches recent viewport/layer queries
- requests only currently visible layer asset types
- applies the central frontend zoom-level rules before requesting dense layers
- renders PostGIS assets as read-only map overlays
- shows a small Spatial API status panel with count, loading, errors, and truncation warnings

PostGIS assets are deliberately not saved back to Firestore and cannot be edited through the normal map edit handlers.

## Phase 3 Zoom-Level Rules

Zoom gating is centralised in:

```text
src/config/assetZoomRules.ts
```

Both existing viewport rendering and the optional spatial API request builder use this shared table. This keeps dense layers such as homes and drop cables out of low-zoom requests and low-zoom Leaflet rendering.

Current starting thresholds:

| Asset kind | Minimum zoom |
| --- | --- |
| Exchange | 8 |
| Fibrehood | 10 |
| AG polygon | 11 |
| Feeder/link cable | 11 |
| Joint/street cabinet | 13 |
| Pole/chamber/distribution cable | 15 |
| Distribution point | 16 |
| Home | 17 |
| Drop cable | 18 |

## Phase 4 Dense Layer Optimisation

Dense point rendering is now presentation-optimised in the frontend:

- homes use the existing home cluster/stack rendering
- DPs, poles, and chambers cluster below close-edit zoom
- clusters zoom into their contained assets when clicked
- cables are never clustered
- exact point markers return at close zoom
- clustering is disabled during cable drawing and active asset movement

This keeps dense point layers lighter without changing asset geometry, storage, Firestore writes, or PostGIS writes.

## Phase 5 Import And Measurement

Use the GeoJSON import command to load one exported AG or test dataset into PostGIS without touching Firestore.

Dry run first:

```bash
npm run db:import:geojson -- --file ./imports/bd-bas-ag1.geojson --business-id fibre-gis-v2 --area-id BD-BAS-AG1 --source qgis-export --dry-run
```

Import:

```bash
npm run db:import:geojson -- --file ./imports/bd-bas-ag1.geojson --business-id fibre-gis-v2 --area-id BD-BAS-AG1 --source qgis-export --source-revision 2026-07-10
```

The importer accepts GeoJSON `FeatureCollection`, a single `Feature`, or an array of features. It upserts by stable generated UUID based on business, source, and source feature identity.

Stats endpoint:

```http
GET http://localhost:3001/api/assets/stats?businessId=fibre-gis-v2
```

Optional bounded stats:

```http
GET http://localhost:3001/api/assets/stats?businessId=fibre-gis-v2&areaId=BD-BAS-AG1&minLng=-1.80&minLat=53.82&maxLng=-1.76&maxLat=53.85
```

The normal `/api/assets` response now includes `meta.queryMs` so viewport query timing can be recorded during performance tests.

Asset type filters expand common aliases. For example, `distribution-point` also matches older `dp` rows, and `feederCable` also matches `feeder-cable`.

Import audit endpoint:

```http
GET http://localhost:3001/api/assets/import-runs?businessId=fibre-gis-v2&limit=20
```

Each real GeoJSON import records an import run with source file, area, counts, skipped count, and type breakdown. Dry runs do not write an import run.

Folder import:

```bash
npm run db:import:geojson-folder -- --dir ./imports --business-id fibre-gis-v2 --source qgis-export --dry-run
```

The folder importer reads every `.geojson` file in the directory and derives `areaId` from the filename.

## Current Limitations

- Firebase ID-token verification is stubbed in `authMiddleware.ts`.
- No production write path exists.
- GeoJSON import is server-side only and does not sync from Firestore automatically.
- The viewport loader is proof-of-concept only and still depends on test/imported PostGIS data.
- No vector tile, clustering, or server simplification layer exists yet.
- This is not ready to become the source of truth for live assets.

## Phase 1 Safety Rules

- Keep Firestore production save/load unchanged.
- Keep PostGIS read-only from the frontend.
- Do not expose PostgreSQL directly to browsers.
- Do not enable public deployment without Firebase token verification, HTTPS, firewall rules, backups, and restoration testing.
