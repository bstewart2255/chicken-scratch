-- Allow user rows to be deleted while preserving consent records for legal compliance.
-- Consent records must be kept for 7 years (BIPA/GDPR audit trail).
-- When a user is deleted, consents.user_id is set to NULL — external_user_id,
-- tenant_id, policy_version, and timestamps are retained for compliance.

-- Drop the existing NOT NULL constraint + implicit FK on consents.user_id
ALTER TABLE consents ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old FK (Postgres auto-names it consents_user_id_fkey)
ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_user_id_fkey;

-- Re-add FK with ON DELETE SET NULL so deleting a user nulls the reference
ALTER TABLE consents
  ADD CONSTRAINT consents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
