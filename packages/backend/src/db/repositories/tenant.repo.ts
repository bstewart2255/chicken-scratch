import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { query } from '../connection.js';

export interface TenantRow {
  id: string;
  name: string;
  api_key: string;
  active: boolean;
  created_at: string;
}

export interface TenantUserRow {
  id: string;
  tenant_id: string;
  external_user_id: string;
  user_id: string;
  created_at: string;
}

function generateApiKey(): string {
  return `cs_${crypto.randomBytes(32).toString('hex')}`;
}

export async function createTenant(name: string): Promise<TenantRow> {
  const id = uuid();
  const apiKey = generateApiKey();
  const result = await query<TenantRow>(
    'INSERT INTO tenants (id, name, api_key) VALUES ($1, $2, $3) RETURNING *',
    [id, name, apiKey],
  );
  return result.rows[0];
}

export async function findByApiKey(apiKey: string): Promise<TenantRow | undefined> {
  const result = await query<TenantRow>(
    'SELECT * FROM tenants WHERE api_key = $1 AND active = TRUE',
    [apiKey],
  );
  return result.rows[0];
}

export async function findById(id: string): Promise<TenantRow | undefined> {
  const result = await query<TenantRow>(
    'SELECT * FROM tenants WHERE id = $1',
    [id],
  );
  return result.rows[0];
}

export async function listTenants(): Promise<TenantRow[]> {
  const result = await query<TenantRow>(
    'SELECT * FROM tenants ORDER BY created_at DESC',
  );
  return result.rows;
}

export async function rotateApiKey(tenantId: string): Promise<string> {
  const newKey = generateApiKey();
  await query('UPDATE tenants SET api_key = $1 WHERE id = $2', [newKey, tenantId]);
  return newKey;
}

export async function deactivateTenant(tenantId: string): Promise<void> {
  await query('UPDATE tenants SET active = FALSE WHERE id = $1', [tenantId]);
}

// Tenant-user mapping

export async function findTenantUser(tenantId: string, externalUserId: string): Promise<TenantUserRow | undefined> {
  const result = await query<TenantUserRow>(
    'SELECT * FROM tenant_users WHERE tenant_id = $1 AND external_user_id = $2',
    [tenantId, externalUserId],
  );
  return result.rows[0];
}

export async function createTenantUser(tenantId: string, externalUserId: string, userId: string): Promise<TenantUserRow> {
  const id = uuid();
  const result = await query<TenantUserRow>(
    'INSERT INTO tenant_users (id, tenant_id, external_user_id, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, tenantId, externalUserId, userId],
  );
  return result.rows[0];
}

export async function listTenantUsers(tenantId: string): Promise<TenantUserRow[]> {
  const result = await query<TenantUserRow>(
    'SELECT * FROM tenant_users WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId],
  );
  return result.rows;
}

export async function deleteTenantUser(tenantId: string, externalUserId: string): Promise<void> {
  await query(
    'DELETE FROM tenant_users WHERE tenant_id = $1 AND external_user_id = $2',
    [tenantId, externalUserId],
  );
}

export async function getTenantUserCount(tenantId: string): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = $1',
    [tenantId],
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Resolve an external user ID to an internal username.
 * Format: t:{tenant_id}:{external_user_id}
 * This ensures uniqueness across tenants.
 */
export function toInternalUsername(tenantId: string, externalUserId: string): string {
  return `t:${tenantId}:${externalUserId}`;
}
