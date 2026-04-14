-- Add house and smiley drawing types to shape tables.
-- SQLite doesn't support ALTER CONSTRAINT, so we recreate the tables.

-- Recreate shape_samples with expanded CHECK constraint and nullable shape_features
CREATE TABLE shape_samples_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  shape_type TEXT NOT NULL CHECK (shape_type IN ('circle', 'square', 'triangle', 'house', 'smiley')),
  stroke_data TEXT NOT NULL,
  biometric_features TEXT NOT NULL,
  shape_features TEXT,              -- NULL for drawings (biometric-only)
  device_capabilities TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, shape_type)
);

INSERT INTO shape_samples_new SELECT * FROM shape_samples;
DROP TABLE shape_samples;
ALTER TABLE shape_samples_new RENAME TO shape_samples;
CREATE INDEX idx_shape_samples_user ON shape_samples(user_id);

-- Recreate shape_baselines with expanded CHECK constraint and nullable avg_shape_features
CREATE TABLE shape_baselines_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  shape_type TEXT NOT NULL CHECK (shape_type IN ('circle', 'square', 'triangle', 'house', 'smiley')),
  avg_biometric_features TEXT NOT NULL,
  avg_shape_features TEXT,          -- NULL for drawings (biometric-only)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, shape_type)
);

INSERT INTO shape_baselines_new SELECT * FROM shape_baselines;
DROP TABLE shape_baselines;
ALTER TABLE shape_baselines_new RENAME TO shape_baselines;
CREATE INDEX idx_shape_baselines_user ON shape_baselines(user_id);
