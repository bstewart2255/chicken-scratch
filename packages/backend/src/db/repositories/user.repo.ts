import { v4 as uuid } from 'uuid';
import { query, withTransaction } from '../connection.js';
import type pg from 'pg';

export interface UserRow {
  id: string;
  username: string;
  enrolled: boolean;
  created_at: string;
}

export async function createUser(username: string): Promise<UserRow> {
  const id = uuid();
  const result = await query<UserRow>(
    'INSERT INTO users (id, username) VALUES ($1, $2) RETURNING *',
    [id, username],
  );
  return result.rows[0];
}

export async function findByUsername(username: string): Promise<UserRow | undefined> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE username = $1',
    [username],
  );
  return result.rows[0];
}

export async function markEnrolled(userId: string): Promise<void> {
  await query('UPDATE users SET enrolled = TRUE WHERE id = $1', [userId]);
}

export async function listUsers(): Promise<UserRow[]> {
  const result = await query<UserRow>(
    'SELECT * FROM users ORDER BY created_at DESC',
  );
  return result.rows;
}

export interface DeletionSummary {
  enrollmentSamplesDeleted: number;
  baselineDeleted: boolean;
  shapeSamplesDeleted: number;
  shapeBaselinesDeleted: number;
  authAttemptsDeleted: number;
  sessionsDeleted: number;
}

/**
 * Permanently delete all biometric data for a user, then the user row itself.
 * Consent records are preserved (set user_id = NULL) — required for 7-year legal retention.
 * Runs inside a single transaction; rolls back on any failure.
 */
export async function deleteUser(
  userId: string,
  internalUsername: string,
): Promise<DeletionSummary> {
  return withTransaction(async (client: pg.PoolClient) => {
    const del = async (text: string, params: unknown[]) =>
      (await client.query(text, params)).rowCount ?? 0;

    const enrollmentSamplesDeleted = await del(
      'DELETE FROM enrollment_samples WHERE user_id = $1', [userId]);
    const baselineRows = await del(
      'DELETE FROM baselines WHERE user_id = $1', [userId]);
    const shapeSamplesDeleted = await del(
      'DELETE FROM shape_samples WHERE user_id = $1', [userId]);
    const shapeBaselinesDeleted = await del(
      'DELETE FROM shape_baselines WHERE user_id = $1', [userId]);
    const authAttemptsDeleted = await del(
      'DELETE FROM auth_attempts WHERE user_id = $1', [userId]);
    const sessionsDeleted = await del(
      'DELETE FROM sessions WHERE username = $1', [internalUsername]);

    // Delete the user row last (FK cascade will null out consents.user_id)
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    return {
      enrollmentSamplesDeleted,
      baselineDeleted: baselineRows > 0,
      shapeSamplesDeleted,
      shapeBaselinesDeleted,
      authAttemptsDeleted,
      sessionsDeleted,
    };
  });
}
