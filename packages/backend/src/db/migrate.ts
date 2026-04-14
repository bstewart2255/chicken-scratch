import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const existing = await query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (existing.rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await query(sql);
    await query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    console.log(`Migration applied: ${file}`);
  }
}

// Run directly if called as script
const isMain = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\.ts$/, ''));
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('All migrations complete.');
      return closePool();
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
