import crypto from 'crypto';
import { query } from './db.js';

/**
 * demo-app user + session storage.
 *
 * Users persist to Postgres (demo_users table) so Railway restarts don't
 * wipe them. This is a deliberately-simplistic customer-auth layer —
 * passwords are stored plaintext, no email verification, no hashing. A
 * real customer runs Auth0 / Clerk / Cognito / their-own-auth and wires
 * chickenScratch alongside, not instead of.
 *
 * Sessions stay in-memory. They're short-lived (no explicit TTL here; the
 * browser's sessionToken just becomes invalid on restart), and re-login
 * is cheap. Persisting them would bloat the DB without real UX gain.
 */

export interface DemoUser {
  id: string;           // externalUserId that gets passed to chickenScratch
  email: string;
  password: string;     // plaintext (demo only)
  createdAt: string;
  // Which email the user *actually* signed up with, in case they've
  // forgotten by the time they hit the recovery flow (a core use case for
  // biometric recovery — users forget both the password *and* the email).
  recoveryHint: string;
}

export interface DemoSession {
  token: string;
  userId: string;
  createdAt: number;
}

interface DemoUserRow {
  id: string;
  email: string;
  password: string;
  recovery_hint: string;
  created_at: Date;
}

function rowToUser(row: DemoUserRow): DemoUser {
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    recoveryHint: row.recovery_hint,
    createdAt: (row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)),
  };
}

const sessions = new Map<string, DemoSession>();  // session token → session

export async function createUser(email: string, password: string): Promise<DemoUser> {
  const id = `demo-${crypto.randomBytes(6).toString('hex')}`;
  const recoveryHint = email.split('@')[0] + '@…';
  try {
    const result = await query<DemoUserRow>(
      `INSERT INTO demo_users (id, email, password, recovery_hint)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, email, password, recoveryHint],
    );
    return rowToUser(result.rows[0]);
  } catch (err) {
    // Postgres unique_violation on email
    if ((err as { code?: string }).code === '23505') {
      throw new Error('An account with that email already exists.');
    }
    throw err;
  }
}

export async function findUserByEmail(email: string): Promise<DemoUser | undefined> {
  const result = await query<DemoUserRow>(
    'SELECT * FROM demo_users WHERE email = $1',
    [email],
  );
  return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
}

export async function findUserById(id: string): Promise<DemoUser | undefined> {
  const result = await query<DemoUserRow>(
    'SELECT * FROM demo_users WHERE id = $1',
    [id],
  );
  return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
}

export async function updatePassword(userId: string, newPassword: string): Promise<boolean> {
  const result = await query(
    'UPDATE demo_users SET password = $1 WHERE id = $2',
    [newPassword, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export function createSession(userId: string): DemoSession {
  const session: DemoSession = {
    token: crypto.randomBytes(24).toString('hex'),
    userId,
    createdAt: Date.now(),
  };
  sessions.set(session.token, session);
  return session;
}

export function findSession(token: string): DemoSession | undefined {
  return sessions.get(token);
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

/**
 * Lookup by partial email — the "I forgot which email I signed up with" case.
 * In a real app this would be a proper search; for the demo we just scan
 * (with an ILIKE). Postgres handles the small result set efficiently.
 */
export async function findUsersByEmailFragment(fragment: string): Promise<DemoUser[]> {
  const needle = fragment.trim();
  if (!needle) return [];
  // ILIKE with % wildcards for substring match, case-insensitive.
  const result = await query<DemoUserRow>(
    `SELECT * FROM demo_users WHERE email ILIKE $1 ORDER BY created_at DESC LIMIT 50`,
    [`%${needle}%`],
  );
  return result.rows.map(rowToUser);
}

/**
 * Seeded accounts. Upserts on startup so a known test account always
 * exists after a redeploy, without disturbing any rows accidentally.
 *
 * Historically demo-app users lived in an in-memory Map, so Railway
 * restarts wiped them — even though the biometric enrollment in the
 * chickenScratch Postgres persisted, orphaning the email → externalUserId
 * link. This seeder, now writing to Postgres, continues to re-create
 * known accounts on boot for two reasons:
 *   1. Resurrects mappings for biometric enrollments we want to keep
 *      reachable across test sessions (see DEMO_SEED_USER_ID).
 *   2. Provides a deterministic test account that's always loginable.
 *
 * Env overrides let operators change credentials without a code edit.
 * `DEMO_SEED_DISABLE=1` skips seeding entirely.
 *
 * Additional seeded accounts are declared in the `ADDITIONAL_SEEDS`
 * constant — not env-configurable because these are specifically tied
 * to existing biometric enrollments we want to preserve.
 */
interface SeedSpec {
  email: string;
  password: string;
  id: string;
}

const ADDITIONAL_SEEDS: ReadonlyArray<SeedSpec> = [
  // Mapped to the mobile-enroll + mobile-verify baseline the user built
  // for calibration testing on 2026-04-22.
  {
    email: 'blair-mobile-7@benefitsdesk.com',
    password: 'Password1234',
    id: 'demo-d6e9dff35bb3',
  },
];

async function upsertSeed(spec: SeedSpec): Promise<'inserted' | 'exists'> {
  const recoveryHint = spec.email.split('@')[0] + '@…';
  const result = await query<{ id: string }>(
    `INSERT INTO demo_users (id, email, password, recovery_hint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [spec.id, spec.email, spec.password, recoveryHint],
  );
  return result.rows[0] ? 'inserted' : 'exists';
}

export async function seedAccounts(): Promise<void> {
  if (process.env.DEMO_SEED_DISABLE === '1') return;

  const primary: SeedSpec = {
    email: process.env.DEMO_SEED_EMAIL ?? 'blair@benefitsdesk.com',
    password: process.env.DEMO_SEED_PASSWORD ?? 'Password1234',
    id: process.env.DEMO_SEED_USER_ID ?? 'demo-c11c20229039',
  };

  const specs = [primary, ...ADDITIONAL_SEEDS];

  for (const spec of specs) {
    try {
      const result = await upsertSeed(spec);
      console.log(`[demo-app] seed ${spec.email} → ${spec.id} (${result})`);
    } catch (err) {
      // If the ID is already used for a different email (would violate PK),
      // log and continue. Not fatal — the other seeds should still apply.
      console.warn(`[demo-app] seed ${spec.email} failed:`, (err as Error).message);
    }
  }
}
