-- Audit/events log: a single append-only table that captures every
-- security-relevant action for a user or tenant (enrollment, verify,
-- consent grant/withdraw, device added, lockout triggered, user deleted).
-- Exposed to customers via GET /api/v1/events for compliance review.
-- Exposed to chickenScratch operators via the admin dashboard later.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  external_user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'enrollment_completed',
    'verification_passed',
    'verification_failed',
    'device_class_mismatch',
    'recovery_gate_blocked',
    'lockout_triggered',
    'consent_granted',
    'consent_withdrawn',
    'user_deleted'
  )),
  device_class TEXT CHECK (device_class IN ('mobile', 'desktop') OR device_class IS NULL),
  metadata TEXT,                                -- JSON blob, event-specific
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant-scoped lookup (per-user event history)
CREATE INDEX IF NOT EXISTS idx_events_tenant_user_created
  ON events (tenant_id, external_user_id, created_at DESC);

-- Tenant-wide cursor pagination
CREATE INDEX IF NOT EXISTS idx_events_tenant_created
  ON events (tenant_id, created_at DESC);

-- Type-filtered queries ("show me all lockouts")
CREATE INDEX IF NOT EXISTS idx_events_tenant_type_created
  ON events (tenant_id, event_type, created_at DESC);
