import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';

export interface UserRow {
  id: string;
  username: string;
  enrolled: number;
  created_at: string;
}

export function createUser(username: string): UserRow {
  const db = getDb();
  const id = uuid();
  db.prepare(
    'INSERT INTO users (id, username) VALUES (?, ?)'
  ).run(id, username);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
}

export function findByUsername(username: string): UserRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function markEnrolled(userId: string): void {
  const db = getDb();
  db.prepare('UPDATE users SET enrolled = 1 WHERE id = ?').run(userId);
}

export function listUsers(): UserRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
}
