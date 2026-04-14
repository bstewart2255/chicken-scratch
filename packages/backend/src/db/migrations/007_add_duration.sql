-- Track how long enrollment and verification flows take.
ALTER TABLE auth_attempts ADD COLUMN duration_ms INTEGER;
ALTER TABLE auth_attempts ADD COLUMN step_durations TEXT;  -- JSON array of per-step durations

-- Also track enrollment duration on the session itself
ALTER TABLE sessions ADD COLUMN duration_ms INTEGER;
ALTER TABLE sessions ADD COLUMN step_durations TEXT;
