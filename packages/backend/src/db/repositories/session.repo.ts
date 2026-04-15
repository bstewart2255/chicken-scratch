import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
import type { SessionType, SessionStatus } from '@chicken-scratch/shared';

export interface SessionRow {
  id: string;
  username: string;
  type: string;
  status: string;
  shape_order: string;
  result: string | null;
  created_at: string;
  expires_at: Date;
}

export async function createSession(
  username: string,
  type: SessionType,
  expiresAt: string,
  shapeOrder: string[],
): Promise<SessionRow> {
  const id = uuid();
  const result = await query<SessionRow>(`
    INSERT INTO sessions (id, username, type, status, shape_order, expires_at)
    VALUES ($1, $2, $3, 'pending', $4, $5)
    RETURNING *
  `, [id, username, type, JSON.stringify(shapeOrder), expiresAt]);
  return result.rows[0];
}

export async function getSession(id: string): Promise<SessionRow | undefined> {
  const result = await query<SessionRow>(
    'SELECT * FROM sessions WHERE id = $1',
    [id],
  );
  return result.rows[0];
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  await query('UPDATE sessions SET status = $1 WHERE id = $2', [status, id]);
}

export async function completeSession(id: string, result: Record<string, unknown>): Promise<void> {
  await query(`
    UPDATE sessions SET status = 'completed', result = $1 WHERE id = $2
  `, [JSON.stringify(result), id]);
}

export async function expireOldSessions(): Promise<number> {
  const result = await query(`
    UPDATE sessions SET status = 'expired'
    WHERE status IN ('pending', 'in_progress')
    AND expires_at < NOW()
  `);
  return result.rowCount ?? 0;
}
