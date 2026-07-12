CREATE TABLE IF NOT EXISTS import_runs (
    id UUID PRIMARY KEY,
    business_id TEXT NOT NULL,
    project_id TEXT,
    area_id TEXT,
    source TEXT NOT NULL,
    source_revision TEXT,
    source_file TEXT,
    read_count INTEGER NOT NULL,
    valid_count INTEGER NOT NULL,
    inserted_or_updated_count INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL,
    by_type JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_runs_business_idx
ON import_runs (business_id);

CREATE INDEX IF NOT EXISTS import_runs_area_idx
ON import_runs (area_id);

CREATE INDEX IF NOT EXISTS import_runs_created_idx
ON import_runs (created_at DESC);
