-- Migrate API keys from plaintext to hashed storage
-- Add organization enrichment: slugs, plans, usage tracking

-- Add new columns to tenants table
ALTER TABLE tenants ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'enterprise'));
ALTER TABLE tenants ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Generate slugs from existing tenant names (lowercase, hyphens)
UPDATE tenants SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), '.', ''));

-- Make slug required going forward
-- (Can't ALTER NOT NULL in Postgres easily, but the CHECK + app logic handles it)

-- New api_keys table (replaces plaintext api_key column on tenants)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Usage events table for tracking API calls per tenant
CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('enroll', 'verify', 'session', 'consent')),
  user_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_type ON usage_events(tenant_id, event_type);
