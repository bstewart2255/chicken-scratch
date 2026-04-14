import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';

export interface ConsentRow {
  id: string;
  tenant_id: string;
  user_id: string;
  external_user_id: string;
  policy_version: string;
  ip_address: string | null;
  user_agent: string | null;
  consented_at: string;
  withdrawn_at: string | null;
}

/** Record or refresh consent for a user+tenant+policy combination. */
export async function recordConsent(
  tenantId: string,
  userId: string,
  externalUserId: string,
  policyVersion: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<ConsentRow> {
  const id = uuid();
  const result = await query<ConsentRow>(`
    INSERT INTO consents (id, tenant_id, user_id, external_user_id, policy_version, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(tenant_id, user_id, policy_version) DO UPDATE SET
      consented_at = NOW(),
      withdrawn_at = NULL,
      ip_address = EXCLUDED.ip_address,
      user_agent = EXCLUDED.user_agent
    RETURNING *
  `, [id, tenantId, userId, externalUserId, policyVersion, ipAddress, userAgent]);
  return result.rows[0];
}

/** Get the most recent consent record for a user (any policy version). */
export async function getLatestConsent(tenantId: string, userId: string): Promise<ConsentRow | undefined> {
  const result = await query<ConsentRow>(`
    SELECT * FROM consents
    WHERE tenant_id = $1 AND user_id = $2
    ORDER BY consented_at DESC
    LIMIT 1
  `, [tenantId, userId]);
  return result.rows[0];
}

/** Get consent for a specific policy version. */
export async function getConsentForVersion(
  tenantId: string,
  userId: string,
  policyVersion: string,
): Promise<ConsentRow | undefined> {
  const result = await query<ConsentRow>(`
    SELECT * FROM consents
    WHERE tenant_id = $1 AND user_id = $2 AND policy_version = $3
  `, [tenantId, userId, policyVersion]);
  return result.rows[0];
}

/** Mark all consent records for a user as withdrawn. */
export async function withdrawConsent(tenantId: string, userId: string): Promise<void> {
  await query(`
    UPDATE consents SET withdrawn_at = NOW()
    WHERE tenant_id = $1 AND user_id = $2 AND withdrawn_at IS NULL
  `, [tenantId, userId]);
}

/** List all active (non-withdrawn) consents for a tenant, newest first. */
export async function listTenantConsents(tenantId: string): Promise<ConsentRow[]> {
  const result = await query<ConsentRow>(`
    SELECT * FROM consents
    WHERE tenant_id = $1
    ORDER BY consented_at DESC
  `, [tenantId]);
  return result.rows;
}

/** Count active consents for a tenant. */
export async function countActiveConsents(tenantId: string): Promise<number> {
  const result = await query<{ count: string }>(`
    SELECT COUNT(*) as count FROM consents
    WHERE tenant_id = $1 AND withdrawn_at IS NULL
  `, [tenantId]);
  return parseInt(result.rows[0].count, 10);
}
