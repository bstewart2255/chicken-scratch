-- Consent records: track explicit biometric data consent per user per policy version
-- Required for BIPA (Illinois), GDPR Article 9, and Texas CUBI compliance

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  external_user_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  UNIQUE(tenant_id, user_id, policy_version)
);

CREATE INDEX idx_consents_tenant_user ON consents(tenant_id, user_id);
CREATE INDEX idx_consents_tenant_external ON consents(tenant_id, external_user_id);
