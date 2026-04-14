import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { SessionType, SessionStatus } from '@chicken-scratch/shared';

export interface SessionRow {
  id: string;
  username: string;
  type: string;
  status: string;
  shape_order: string;
  result: string | null;
  created_at: string;
  expires_at: string;
}

export function createSession(
  username: string,
  type: SessionType,
  expiresAt: string,
  shapeOrder: string[],
): SessionRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO sessions (id, username, type, status, shape_order, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(id, username, type, JSON.stringify(shapeOrder), expiresAt);
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow;
}

export function getSession(id: string): SessionRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
}

export function updateSessionStatus(id: string, status: SessionStatus): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id);
}

export function completeSession(id: string, result: Record<string, unknown>): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET status = 'completed', result = ? WHERE id = ?
  `).run(JSON.stringify(result), id);
}

export function expireOldSessions(): number {
  const db = getDb();
  const info = db.prepare(`
    UPDATE sessions SET status = 'expired'
    WHERE status IN ('pending', 'in_progress')
    AND expires_at < datetime('now')
  `).run();
  return info.changes;
}
