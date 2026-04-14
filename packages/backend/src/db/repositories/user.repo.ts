import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';

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
