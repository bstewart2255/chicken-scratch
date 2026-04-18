-- Multi-device support: each user can have separate enrollment baselines per
-- device class (mobile = finger on touchscreen; desktop = mouse/trackpad/pen).
-- A user enrolling on both classes ends up with two sets of baselines and can
-- verify from either. Class is detected from the submitted stroke data at both
-- enrollment and verify time.

-- enrollment_samples: one set of 1-3 samples per (user, class)
ALTER TABLE enrollment_samples ADD COLUMN device_class TEXT NOT NULL DEFAULT 'mobile'
  CHECK (device_class IN ('mobile', 'desktop'));
ALTER TABLE enrollment_samples DROP CONSTRAINT IF EXISTS enrollment_samples_user_id_sample_number_key;
ALTER TABLE enrollment_samples ADD CONSTRAINT enrollment_samples_user_device_sample_key
  UNIQUE(user_id, device_class, sample_number);

-- baselines: one signature baseline per (user, class)
ALTER TABLE baselines ADD COLUMN device_class TEXT NOT NULL DEFAULT 'mobile'
  CHECK (device_class IN ('mobile', 'desktop'));
ALTER TABLE baselines DROP CONSTRAINT IF EXISTS baselines_user_id_key;
ALTER TABLE baselines ADD CONSTRAINT baselines_user_device_key
  UNIQUE(user_id, device_class);

-- shape_samples: one sample per (user, shape_type, class)
ALTER TABLE shape_samples ADD COLUMN device_class TEXT NOT NULL DEFAULT 'mobile'
  CHECK (device_class IN ('mobile', 'desktop'));
ALTER TABLE shape_samples DROP CONSTRAINT IF EXISTS shape_samples_user_id_shape_type_key;
ALTER TABLE shape_samples ADD CONSTRAINT shape_samples_user_shape_device_key
  UNIQUE(user_id, shape_type, device_class);

-- shape_baselines: one shape baseline per (user, shape_type, class)
ALTER TABLE shape_baselines ADD COLUMN device_class TEXT NOT NULL DEFAULT 'mobile'
  CHECK (device_class IN ('mobile', 'desktop'));
ALTER TABLE shape_baselines DROP CONSTRAINT IF EXISTS shape_baselines_user_id_shape_type_key;
ALTER TABLE shape_baselines ADD CONSTRAINT shape_baselines_user_shape_device_key
  UNIQUE(user_id, shape_type, device_class);

-- auth_attempts: record which class was used. Enables the recent-verify gate
-- ("you must have verified on an existing class in the last N minutes before
-- adding a new device class") and per-class diagnostics.
-- Nullable for old rows that predate this column.
ALTER TABLE auth_attempts ADD COLUMN device_class TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_recent_success
  ON auth_attempts(user_id, created_at DESC)
  WHERE authenticated = TRUE;
