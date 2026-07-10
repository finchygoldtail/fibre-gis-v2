CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS map_assets (
    id UUID PRIMARY KEY,
    business_id TEXT NOT NULL,
    project_id TEXT,
    area_id TEXT,
    asset_type TEXT NOT NULL,
    asset_subtype TEXT,
    name TEXT,
    status TEXT,
    geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT,
    source_revision TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS map_assets_geometry_gix
ON map_assets
USING GIST (geometry);

CREATE INDEX IF NOT EXISTS map_assets_business_idx
ON map_assets (business_id);

CREATE INDEX IF NOT EXISTS map_assets_project_idx
ON map_assets (project_id);

CREATE INDEX IF NOT EXISTS map_assets_area_idx
ON map_assets (area_id);

CREATE INDEX IF NOT EXISTS map_assets_type_idx
ON map_assets (asset_type);

CREATE INDEX IF NOT EXISTS map_assets_business_area_type_idx
ON map_assets (business_id, area_id, asset_type);
