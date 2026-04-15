CREATE TABLE IF NOT EXISTS shape_samples (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  shape_type TEXT NOT NULL CHECK (shape_type IN ('circle', 'square', 'triangle')),
  stroke_data TEXT NOT NULL,            -- JSON (RawSignatureData)
  biometric_features TEXT NOT NULL,     -- JSON (AllFeatures)
  shape_features TEXT NOT NULL,         -- JSON (ShapeSpecificFeatures)
  device_capabilities TEXT NOT NULL,    -- JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shape_type)
);

CREATE TABLE IF NOT EXISTS shape_baselines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  shape_type TEXT NOT NULL CHECK (shape_type IN ('circle', 'square', 'triangle')),
  avg_biometric_features TEXT NOT NULL, -- JSON (AllFeatures averaged)
  avg_shape_features TEXT NOT NULL,     -- JSON (ShapeSpecificFeatures)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shape_type)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('enroll', 'verify')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  result TEXT,                          -- JSON (result data, null until completed)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shape_samples_user ON shape_samples(user_id);
CREATE INDEX IF NOT EXISTS idx_shape_baselines_user ON shape_baselines(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
