import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { query } from '../connection.js';

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
}

const KEY_PREFIX = 'cs_live_';

export function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateRawKey(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
}

export async function createApiKey(
  tenantId: string,
  name: string,
): Promise<{ row: ApiKeyRow; rawKey: string }> {
  const id = uuid();
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = `${KEY_PREFIX}${rawKey.slice(KEY_PREFIX.length, KEY_PREFIX.length + 8)}...`;

  const result = await query<ApiKeyRow>(
    `INSERT INTO api_keys (id, tenant_id, key_hash, key_prefix, name)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, tenantId, keyHash, keyPrefix, name],
  );
  return { row: result.rows[0], rawKey };
}

export async function findByKeyHash(keyHash: string): Promise<ApiKeyRow | undefined> {
  const result = await query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE key_hash = $1 AND status = $2',
    [keyHash, 'active'],
  );
  return result.rows[0];
}

export async function listByTenant(tenantId: string): Promise<ApiKeyRow[]> {
  const result = await query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId],
  );
  return result.rows;
}

export async function revokeKey(id: string): Promise<void> {
  await query('UPDATE api_keys SET status = $1 WHERE id = $2', ['revoked', id]);
}

export async function touchLastUsed(id: string): Promise<void> {
  await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
}
