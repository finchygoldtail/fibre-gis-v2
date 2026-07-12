CREATE TABLE IF NOT EXISTS app_records (
    id UUID PRIMARY KEY,
    business_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    parent_type TEXT,
    parent_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS app_records_business_type_idx
ON app_records (business_id, record_type);

CREATE INDEX IF NOT EXISTS app_records_parent_idx
ON app_records (business_id, parent_type, parent_id);

CREATE INDEX IF NOT EXISTS app_records_updated_idx
ON app_records (updated_at DESC);
