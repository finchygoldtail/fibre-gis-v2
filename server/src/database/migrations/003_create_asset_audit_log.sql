CREATE TABLE IF NOT EXISTS asset_audit_logs (
    id UUID PRIMARY KEY,
    asset_id UUID,
    business_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_uid TEXT,
    actor_email TEXT,
    before_asset JSONB,
    after_asset JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_audit_logs_asset_idx
ON asset_audit_logs (asset_id);

CREATE INDEX IF NOT EXISTS asset_audit_logs_business_idx
ON asset_audit_logs (business_id);

CREATE INDEX IF NOT EXISTS asset_audit_logs_created_idx
ON asset_audit_logs (created_at DESC);
