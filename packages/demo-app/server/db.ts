import pg from 'pg';

/**
 * Demo-app owns its own persistence. It shares the same Railway Postgres
 * instance as the chickenScratch backend (single DATABASE_URL on the
 * platform) but uses its own table (`demo_users`) so the two services
 * don't collide on schema ownership. The chickenScratch backend stores
 * internal biometric usernames; demo-app stores customer-facing email ↔
 * externalUserId mappings.
 *
 * Sessions remain in-memory (see auth.ts) — they're short-lived and a
 * Railway restart just logs the user out, which the login form recovers
 * from. Persisting sessions would bloat the DB for no real UX gain.
 */

const connectionString = process.env.DATABASE_URL;

// Lazy pool — don't connect if DATABASE_URL isn't set (e.g. unit tests).
// Demo-app callers that need persistence should fail loudly at runtime
// rather than silently fall through to broken in-memory state.
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!connectionString) {
    throw new Error(
      'demo-app: DATABASE_URL not set. demo_users persistence requires a Postgres connection. ' +
      'On Railway, the database service auto-injects this variable — verify it on the ' +
      'chickenScratch-demo-app service Variables page.',
    );
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      // Railway's Postgres uses SSL. Node pg auto-detects from URL; explicit
      // to avoid surprise in local-dev against a non-SSL Postgres.
      ssl: connectionString.includes('railway') || connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(sql, params as unknown[]);
}

/**
 * Idempotent schema init. Runs on server startup. Uses CREATE TABLE IF NOT
 * EXISTS so restart is safe; schema changes would need a proper migration,
 * but for demo-app's tiny surface this is simpler than a migration framework.
 *
 * Note: chickenScratch backend has its own migrations table for its own
 * schema (`baselines`, `enrollment_samples`, etc.). This is orthogonal —
 * demo-app owns its own table in the same DB.
 */
export async function ensureSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS demo_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      recovery_hint TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_demo_users_email ON demo_users(email)`);
}
