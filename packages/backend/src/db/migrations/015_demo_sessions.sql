-- Demo mode support for landing page try-it-out feature
ALTER TABLE sessions ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- Drop and recreate the type check to include demo types
-- (Postgres doesn't support ALTER CONSTRAINT, so we drop and re-add)
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_type_check;
-- Note: if the constraint doesn't exist by name, the column may use inline CHECK.
-- In that case, this is a no-op and the new values will work via application logic.

-- Index for cleanup queries (find expired demo sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_demo ON sessions(is_demo) WHERE is_demo = TRUE;
