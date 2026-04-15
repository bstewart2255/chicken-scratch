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

export async function createSession(
  username: string,
  type: SessionType,
): Promise<CreateSessionResponse> {
  await sessionRepo.expireOldSessions();

  const shapeOrder = shuffle([...ALL_CHALLENGE_TYPES]);
  const expiresAt = new Date(Date.now() + THRESHOLDS.SESSION_TTL_MS).toISOString();
  const session = await sessionRepo.createSession(username, type, expiresAt, shapeOrder);

  const lanIp = getLanIp();
  const url = `http://${lanIp}:5173/mobile/${session.id}`;

  return {
    sessionId: session.id,
    url,
    shapeOrder,
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
    createdAt: session.created_at,
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}

export async function updateSessionStatus(id: string, status: 'pending' | 'in_progress' | 'completed' | 'expired') {
  await sessionRepo.updateSessionStatus(id, status);
}

export async function completeSession(id: string, result: Record<string, unknown>) {
  await sessionRepo.completeSession(id, result);
}
