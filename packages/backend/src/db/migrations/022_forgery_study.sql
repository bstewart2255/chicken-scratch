-- Forgery Study: a standalone flow for collecting informed-forgery
-- attempts at scale. A researcher creates a study per forger (one
-- shareable link = one forger); the forger copies the target's signature
-- and shapes; attempts are scored on the production scoring path and
-- recorded for learning-curve analysis. Kept entirely separate from
-- auth_attempts / lockout / events — no production pollution.

-- A user may only be the target of a study if explicitly opted in. This
-- is the scoping wall: customer enrollments are structurally ineligible.
ALTER TABLE users ADD COLUMN IF NOT EXISTS research_target BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS forgery_studies (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forger_label TEXT NOT NULL,
  device_class TEXT NOT NULL CHECK (device_class IN ('mobile', 'desktop')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forgery_studies_target ON forgery_studies (target_user_id);

CREATE TABLE IF NOT EXISTS forgery_attempts (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES forgery_studies(id) ON DELETE CASCADE,
  attempt_index INTEGER NOT NULL,        -- 1-based; the learning-curve x-axis
  combined_score REAL NOT NULL,
  threshold REAL NOT NULL,
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (study_id, attempt_index)
);

CREATE INDEX IF NOT EXISTS idx_forgery_attempts_study ON forgery_attempts (study_id, attempt_index);

CREATE TABLE IF NOT EXISTS forgery_attempt_items (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES forgery_attempts(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,               -- 'signature' or a shape type
  stroke_data TEXT NOT NULL,             -- encrypted JSON — the forger's raw strokes
  item_score REAL NOT NULL,
  item_breakdown TEXT,                   -- encrypted JSON — per-item comparison detail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forgery_attempt_items_attempt ON forgery_attempt_items (attempt_id);
