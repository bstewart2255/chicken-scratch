import crypto from 'crypto';
import { THRESHOLDS, DEMO_CHALLENGE_TYPES, ALL_CHALLENGE_TYPES } from '@chicken-scratch/shared';
import type { SessionType, CreateSessionResponse, ChallengeResponse } from '@chicken-scratch/shared';
import * as sessionRepo from '../db/repositories/session.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';
import { query as dbQuery } from '../db/connection.js';
import { networkInterfaces } from 'os';

function getLanIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Get the public base URL for QR codes. Priority:
 *   1. Explicit baseUrl arg (route handler passes req-derived `${protocol}://${host}`)
 *   2. PUBLIC_URL env var (if set)
 *   3. LAN IP on Vite dev port (local-dev fallback so a phone on the same WiFi
 *      can reach the frontend dev server)
 *
 * The request-derived form is preferred because it works out of the box on
 * Railway/any host without env-var configuration. The localhost filter keeps
 * local dev working: Vite's proxy uses changeOrigin, so the backend sees
 * Host: localhost:3003 — useless for a phone — and we fall through to LAN IP.
 */
function getBaseUrl(reqBaseUrl?: string): string {
  if (reqBaseUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(reqBaseUrl)) {
    return reqBaseUrl;
  }
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  return `http://${getLanIp()}:5173`;
}

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function createSession(
  username: string,
  type: SessionType,
  reqBaseUrl?: string,
): Promise<CreateSessionResponse> {
  await sessionRepo.expireOldSessions();

  const shapeOrder = shuffle([...ALL_CHALLENGE_TYPES]);
  const expiresAt = new Date(Date.now() + THRESHOLDS.SESSION_TTL_MS).toISOString();
  const session = await sessionRepo.createSession(username, type, expiresAt, shapeOrder);

  const url = `${getBaseUrl(reqBaseUrl)}/mobile/${session.id}`;

  return {
    sessionId: session.id,
    url,
    shapeOrder,
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}

/**
 * Get just the lifecycle-relevant bits of a session — `status` and `result`.
 * Used by the tenant-scoped mobile-session polling endpoint. Deliberately
 * narrower than getSession() so the tenant can't read back shapeOrder or
 * the full internal username (minor info-hygiene).
 */
export async function getSessionStatus(id: string): Promise<
  { status: string; result: Record<string, unknown> | null; expiresAt: string } | null
> {
  await sessionRepo.expireOldSessions();
  const session = await sessionRepo.getSession(id);
  if (!session) return null;
  return {
    status: session.status,
    result: session.result ? JSON.parse(session.result) : null,
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}

/**
 * Create a challenge for desktop verification (no QR session).
 */
export async function createChallenge(username: string): Promise<ChallengeResponse> {
  await sessionRepo.expireOldSessions();

  const shapeOrder = shuffle([...ALL_CHALLENGE_TYPES]);
  const expiresAt = new Date(Date.now() + THRESHOLDS.SESSION_TTL_MS).toISOString();
  const session = await sessionRepo.createSession(username, 'verify', expiresAt, shapeOrder);

  return {
    challengeId: session.id,
    shapeOrder,
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}

/**
 * Validate that submitted shapes match the challenge's required order.
 * Returns null if valid, or an error message if invalid.
 */
export async function validateShapeOrder(challengeId: string, submittedShapeTypes: string[]): Promise<string | null> {
  await sessionRepo.expireOldSessions();
  const session = await sessionRepo.getSession(challengeId);
  if (!session) return 'Challenge not found or expired.';

  if (session.status === 'completed') return 'Challenge already used.';
  if (session.status === 'expired') return 'Challenge expired.';

  const expectedOrder: string[] = JSON.parse(session.shape_order);

  if (submittedShapeTypes.length !== expectedOrder.length) {
    return `Expected ${expectedOrder.length} shapes, got ${submittedShapeTypes.length}.`;
  }

  for (let i = 0; i < expectedOrder.length; i++) {
    if (submittedShapeTypes[i] !== expectedOrder[i]) {
      return `Shape order mismatch at position ${i + 1}: expected ${expectedOrder[i]}, got ${submittedShapeTypes[i]}.`;
    }
  }

  await sessionRepo.updateSessionStatus(challengeId, 'completed');
  return null;
}

export async function getSession(id: string) {
  await sessionRepo.expireOldSessions();
  const session = await sessionRepo.getSession(id);
  if (!session) return null;
  return {
    id: session.id,
    username: session.username,
    type: session.type,
    status: session.status,
    shapeOrder: JSON.parse(session.shape_order) as string[],
    result: session.result ? JSON.parse(session.result) : null,
    isDemo: session.is_demo,
    createdAt: session.created_at,
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}

// ── Demo Mode ──────────────────────────────────────────────

/**
 * Create a demo enrollment session with auto-generated username.
 * Uses reduced requirements (1 sig + 1 shape + 1 drawing).
 */
export async function createDemoSession(reqBaseUrl?: string): Promise<CreateSessionResponse & { username: string }> {
  await sessionRepo.expireOldSessions();

  const username = `demo-${crypto.randomBytes(4).toString('hex')}`;
  const shapeOrder = shuffle([...DEMO_CHALLENGE_TYPES]);
  const expiresAt = new Date(Date.now() + THRESHOLDS.DEMO_SESSION_TTL_MS).toISOString();
  const session = await sessionRepo.createSession(username, 'demo_enroll', expiresAt, shapeOrder, true);

  const url = `${getBaseUrl(reqBaseUrl)}/demo/${session.id}`;

  return {
    sessionId: session.id,
    url,
    shapeOrder,
    expiresAt: new Date(session.expires_at).toISOString(),
    isDemo: true,
    username,
  };
}

/**
 * Create a demo verification session after enrollment is complete.
 */
export async function createDemoVerifySession(
  username: string,
  enrollSessionId: string,
  reqBaseUrl?: string,
): Promise<CreateSessionResponse> {
  const enrollSession = await sessionRepo.getSession(enrollSessionId);
  if (!enrollSession) throw new Error('Enrollment session not found.');
  if (enrollSession.status !== 'completed') throw new Error('Enrollment not yet completed.');
  if (!enrollSession.is_demo) throw new Error('Not a demo session.');

  // Use the same shape order as enrollment
  const shapeOrder = JSON.parse(enrollSession.shape_order) as string[];
  const expiresAt = new Date(Date.now() + THRESHOLDS.DEMO_SESSION_TTL_MS).toISOString();
  const session = await sessionRepo.createSession(username, 'demo_verify', expiresAt, shapeOrder, true);

  return {
    sessionId: session.id,
    url: `${getBaseUrl(reqBaseUrl)}/demo/${session.id}`,
    shapeOrder,
    expiresAt: new Date(session.expires_at).toISOString(),
    isDemo: true,
    username,
  };
}

/**
 * Clean up demo users whose sessions have expired or completed.
 * Deletes all biometric data for demo users.
 */
export async function cleanupDemoUsers(): Promise<number> {
  // Find demo usernames with only expired/completed sessions
  const result = await dbQuery<{ username: string }>(
    `SELECT DISTINCT username FROM sessions
     WHERE is_demo = TRUE
     AND status IN ('expired', 'completed')
     AND username LIKE 'demo-%'
     AND username NOT IN (
       SELECT username FROM sessions
       WHERE is_demo = TRUE AND status IN ('pending', 'in_progress')
     )`,
  );

  let cleaned = 0;
  for (const row of result.rows) {
    try {
      // Find the user by internal username
      const user = await userRepo.findByUsername(row.username);
      if (user) {
        await userRepo.deleteUser(user.id, row.username);
        cleaned++;
      }
    } catch {
      // User may already be deleted
    }
  }
  return cleaned;
}

export async function updateSessionStatus(id: string, status: 'pending' | 'in_progress' | 'completed' | 'expired') {
  await sessionRepo.updateSessionStatus(id, status);
}

export async function completeSession(id: string, result: Record<string, unknown>) {
  await sessionRepo.completeSession(id, result);
}
