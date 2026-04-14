import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../connection.js';

export interface TenantRow {
  id: string;
  name: string;
  api_key: string;
  active: number;
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

export function createTenant(name: string): TenantRow {
  const db = getDb();
  const id = uuid();
  const apiKey = generateApiKey();
  db.prepare(
    'INSERT INTO tenants (id, name, api_key) VALUES (?, ?, ?)'
  ).run(id, name, apiKey);
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as TenantRow;
}

export function findByApiKey(apiKey: string): TenantRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM tenants WHERE api_key = ? AND active = 1'
  ).get(apiKey) as TenantRow | undefined;
}

export function findById(id: string): TenantRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as TenantRow | undefined;
}

export function listTenants(): TenantRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all() as TenantRow[];
}

export function rotateApiKey(tenantId: string): string {
  const db = getDb();
  const newKey = generateApiKey();
  db.prepare('UPDATE tenants SET api_key = ? WHERE id = ?').run(newKey, tenantId);
  return newKey;
}

export function deactivateTenant(tenantId: string): void {
  const db = getDb();
  db.prepare('UPDATE tenants SET active = 0 WHERE id = ?').run(tenantId);
}

// Tenant-user mapping

export function findTenantUser(tenantId: string, externalUserId: string): TenantUserRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM tenant_users WHERE tenant_id = ? AND external_user_id = ?'
  ).get(tenantId, externalUserId) as TenantUserRow | undefined;
}

export function createTenantUser(tenantId: string, externalUserId: string, userId: string): TenantUserRow {
  const db = getDb();
  const id = uuid();
  db.prepare(
    'INSERT INTO tenant_users (id, tenant_id, external_user_id, user_id) VALUES (?, ?, ?, ?)'
  ).run(id, tenantId, externalUserId, userId);
  return db.prepare('SELECT * FROM tenant_users WHERE id = ?').get(id) as TenantUserRow;
}

export function listTenantUsers(tenantId: string): TenantUserRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM tenant_users WHERE tenant_id = ? ORDER BY created_at DESC'
  ).all(tenantId) as TenantUserRow[];
}

export function getTenantUserCount(tenantId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ?'
  ).get(tenantId) as { count: number };
  return row.count;
}

/**
 * Resolve an external user ID to an internal username.
 * Format: t:{tenant_id}:{external_user_id}
 * This ensures uniqueness across tenants.
 */
export function toInternalUsername(tenantId: string, externalUserId: string): string {
  return `t:${tenantId}:${externalUserId}`;
}
