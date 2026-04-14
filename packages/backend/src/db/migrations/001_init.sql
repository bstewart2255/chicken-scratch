CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollment_samples (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  sample_number INTEGER NOT NULL CHECK (sample_number BETWEEN 1 AND 3),
  stroke_data TEXT NOT NULL,       -- JSON
  features TEXT NOT NULL,          -- JSON (AllFeatures)
  ml_features TEXT NOT NULL,       -- JSON (MLFeatureVector)
  device_capabilities TEXT NOT NULL, -- JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sample_number)
);

CREATE TABLE IF NOT EXISTS baselines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  avg_features TEXT NOT NULL,      -- JSON (AllFeatures averaged)
  avg_ml_features TEXT NOT NULL,   -- JSON (MLFeatureVector averaged)
  feature_std_devs TEXT NOT NULL,  -- JSON (per-feature standard deviations)
  has_pressure_data BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  score REAL NOT NULL,
  threshold REAL NOT NULL,
  authenticated BOOLEAN NOT NULL,
  breakdown TEXT NOT NULL,         -- JSON (FeatureComparison)
  device_capabilities TEXT NOT NULL, -- JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrollment_samples_user ON enrollment_samples(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_user ON auth_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_created ON auth_attempts(created_at);
