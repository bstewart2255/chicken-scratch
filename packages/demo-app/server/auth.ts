import crypto from 'crypto';

/**
 * In-memory user store. Deliberately NOT production-grade: no password
 * hashing, no persistence, no email verification. This is a demo app whose
 * sole purpose is exercising the chickenScratch SDK integration end-to-end.
 * Real customers use their own auth system (Auth0, Clerk, Cognito, hand-
 * rolled, etc.) — chickenScratch sits alongside, not instead of.
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

const users = new Map<string, DemoUser>();        // email → user
const sessions = new Map<string, DemoSession>();  // session token → session

export function createUser(email: string, password: string): DemoUser {
  if (users.has(email)) {
    throw new Error('An account with that email already exists.');
  }
  const user: DemoUser = {
    id: `demo-${crypto.randomBytes(6).toString('hex')}`,
    email,
    password,
    recoveryHint: email.split('@')[0] + '@…',
    createdAt: new Date().toISOString(),
  };
  users.set(email, user);
  return user;
}

export function findUserByEmail(email: string): DemoUser | undefined {
  return users.get(email);
}

export function findUserById(id: string): DemoUser | undefined {
  for (const u of users.values()) if (u.id === id) return u;
  return undefined;
}

export function updatePassword(userId: string, newPassword: string): boolean {
  const user = findUserById(userId);
  if (!user) return false;
  user.password = newPassword;
  return true;
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
 * In a real app this would be a proper search; for the demo we just scan.
 */
export function findUsersByEmailFragment(fragment: string): DemoUser[] {
  const needle = fragment.trim().toLowerCase();
  if (!needle) return [];
  return Array.from(users.values()).filter(u => u.email.toLowerCase().includes(needle));
}

/**
 * Deterministic seed of a "known test account" that always exists after
 * restart. Because the demo-app stores accounts in-memory, every Railway
 * redeploy wipes user records — but the corresponding biometric enrollment
 * persists in the chickenScratch Postgres. Without this seed, post-redeploy
 * login fails with "account not found" even though the biometric is fine,
 * and the biometric row becomes permanently orphaned from its email.
 *
 * Configurable via env (so credentials can change without a code edit),
 * with defaults that match the account already enrolled in prod — so
 * existing biometric data stays linked across restarts.
 *
 * Env overrides:
 *   DEMO_SEED_EMAIL      default: blair@benefitsdesk.com
 *   DEMO_SEED_PASSWORD   default: Password1234
 *   DEMO_SEED_USER_ID    default: demo-c11c20229039  (must match the
 *                        externalUserId of an existing enrollment if you
 *                        want to preserve biometric state across restarts)
 *
 * Set DEMO_SEED_DISABLE=1 to skip seeding.
 */
export function seedAccounts(): void {
  if (process.env.DEMO_SEED_DISABLE === '1') return;

  const email = process.env.DEMO_SEED_EMAIL ?? 'blair@benefitsdesk.com';
  const password = process.env.DEMO_SEED_PASSWORD ?? 'Password1234';
  const fixedId = process.env.DEMO_SEED_USER_ID ?? 'demo-c11c20229039';

  // Idempotent: if this email is already in the Map (seed called twice, or
  // something upstream beat us to it), leave the existing record alone.
  if (users.has(email)) return;

  users.set(email, {
    id: fixedId,
    email,
    password,
    recoveryHint: email.split('@')[0] + '@…',
    createdAt: new Date().toISOString(),
  });
  // Log so it's visible in Railway logs which seed account landed. Not
  // logging password; email + id pair is enough to diagnose.
  console.log(`[demo-app] seeded deterministic account: ${email} → ${fixedId}`);
}
