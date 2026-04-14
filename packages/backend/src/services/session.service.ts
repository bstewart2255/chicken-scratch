import { THRESHOLDS, ALL_CHALLENGE_TYPES } from '@chicken-scratch/shared';
import type { SessionType, CreateSessionResponse, ChallengeResponse } from '@chicken-scratch/shared';
import * as sessionRepo from '../db/repositories/session.repo.js';
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

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createSession(
  username: string,
  type: SessionType,
): CreateSessionResponse {
  sessionRepo.expireOldSessions();

  const shapeOrder = shuffle([...ALL_CHALLENGE_TYPES]);
  const expiresAt = new Date(Date.now() + THRESHOLDS.SESSION_TTL_MS).toISOString();
  const session = sessionRepo.createSession(username, type, expiresAt, shapeOrder);

  const lanIp = getLanIp();
  const url = `http://${lanIp}:5173/mobile/${session.id}`;

  return {
    sessionId: session.id,
    url,
    shapeOrder,
    expiresAt: session.expires_at,
  };
}

/**
 * Create a challenge for desktop verification (no QR session).
 * Returns a session-backed challenge with a randomized shape order.
 */
export function createChallenge(username: string): ChallengeResponse {
  sessionRepo.expireOldSessions();

  const shapeOrder = shuffle([...ALL_CHALLENGE_TYPES]);
  const expiresAt = new Date(Date.now() + THRESHOLDS.SESSION_TTL_MS).toISOString();
  const session = sessionRepo.createSession(username, 'verify', expiresAt, shapeOrder);

  return {
    challengeId: session.id,
    shapeOrder,
    expiresAt: session.expires_at,
  };
}

/**
 * Validate that submitted shapes match the challenge's required order.
 * Returns null if valid, or an error message if invalid.
 */
export function validateShapeOrder(challengeId: string, submittedShapeTypes: string[]): string | null {
  sessionRepo.expireOldSessions(); // ensure expired sessions are marked before checking
  const session = sessionRepo.getSession(challengeId);
  if (!session) return 'Challenge not found or expired.';

  // Check session hasn't already been used
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

  // Mark challenge as used
  sessionRepo.updateSessionStatus(challengeId, 'completed');
  return null;
}

export function getSession(id: string) {
  sessionRepo.expireOldSessions();
  const session = sessionRepo.getSession(id);
  if (!session) return null;
  return {
    id: session.id,
    username: session.username,
    type: session.type,
    status: session.status,
    shapeOrder: JSON.parse(session.shape_order) as string[],
    result: session.result ? JSON.parse(session.result) : null,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
  };
}

export function updateSessionStatus(id: string, status: 'pending' | 'in_progress' | 'completed' | 'expired') {
  sessionRepo.updateSessionStatus(id, status);
}

export function completeSession(id: string, result: Record<string, unknown>) {
  sessionRepo.completeSession(id, result);
}
