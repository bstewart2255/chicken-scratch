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
