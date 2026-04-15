import { runMigrations } from '../db/migrate.js';
import { query, closePool } from '../db/connection.js';
import { initEncryption } from '../utils/crypto.js';

/**
 * Test setup: ensures migrations are applied and encryption initialized.
 * Uses the DATABASE_URL env var — point this at a test database,
 * NOT production.
 *
 * Run tests with: DATABASE_URL=postgres://... npm test
 */
export async function setupTestDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL required for tests. Point it at a test database, NOT production.\n' +
      'Example: DATABASE_URL=postgres://user:pass@localhost:5432/chickenscratch_test npm test'
    );
  }
  initEncryption();
  await runMigrations();
}

/**
 * Clean all data from tables (preserves schema).
 * Call in beforeEach or afterEach for test isolation.
 */
export async function cleanTables(): Promise<void> {
  // Delete in dependency order
  await query('DELETE FROM usage_events');
  await query('DELETE FROM api_keys');
  await query('DELETE FROM auth_attempts');
  await query('DELETE FROM shape_drawings');
  await query('DELETE FROM shape_baselines');
  await query('DELETE FROM shape_samples');
  await query('DELETE FROM baselines');
  await query('DELETE FROM enrollment_samples');
  await query('DELETE FROM sessions');
  await query('DELETE FROM consents');
  await query('DELETE FROM tenant_users');
  await query('DELETE FROM users');
  await query('DELETE FROM tenants');
}

export async function teardownTestDb(): Promise<void> {
  await closePool();
}
