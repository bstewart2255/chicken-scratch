-- sessions.expires_at was created as TEXT (from the original SQLite schema).
-- Postgres can't compare TEXT < TIMESTAMPTZ, so we convert it.
ALTER TABLE sessions
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ
  USING expires_at::TIMESTAMPTZ;
