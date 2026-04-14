import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const db = getDb();

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Skip if already applied
    const existing = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(file);
    if (existing) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    console.log(`Migration applied: ${file}`);
  }
}

// Run directly if called as script
const isMain = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\.ts$/, ''));
if (isMain) {
  runMigrations();
  closeDb();
  console.log('All migrations complete.');
}
