-- Per-user Mahalanobis scaling for shape-backed biometric sub-scores.
--
-- PR #2 wires the matcher (compareFeatures) to divide each feature's
-- difference by that user's observed per-feature stddev, giving each
-- enrolled user calibrated tolerance rather than a global relative-error
-- formula. For signatures, the variance column (baselines.feature_std_devs)
-- already existed since migration 001. Shapes have no equivalent column —
-- until now.
--
-- Adds biometric_std_devs to shape_baselines. Nullable because some shape
-- baselines may pre-exist from earlier sessions (v3 truncated prod in 018,
-- but local/staging may still hold baselines enrolled before this migration
-- runs). The matcher gracefully falls back to the legacy relative-error
-- formula when the column is null — see compareFeatures's std-dev-undefined
-- branch.

ALTER TABLE shape_baselines
  ADD COLUMN IF NOT EXISTS biometric_std_devs TEXT;
