-- Add 'heart' to the allowed shape_type values on shape_samples and
-- shape_baselines. Triangle stays in the CHECK constraint so historical
-- baseline rows continue to validate (no data deletion required), but
-- new enrollments won't include it — see SHAPE_TYPES / DRAWING_TYPES in
-- packages/shared/src/types/shape.ts.
--
-- Rationale: forgery analysis showed 'triangle' carried weak per-user
-- biometric identity (12yo blind-forger consistently scored 85+ on it
-- vs ~50 on smiley). Drawings carry stronger stylistic signal than
-- simple geometric shapes. 'heart' joins the challenge set as a
-- replacement.

ALTER TABLE shape_samples DROP CONSTRAINT IF EXISTS shape_samples_shape_type_check;
ALTER TABLE shape_samples
  ADD CONSTRAINT shape_samples_shape_type_check
  CHECK (shape_type IN ('circle', 'square', 'triangle', 'house', 'smiley', 'heart'));

ALTER TABLE shape_baselines DROP CONSTRAINT IF EXISTS shape_baselines_shape_type_check;
ALTER TABLE shape_baselines
  ADD CONSTRAINT shape_baselines_shape_type_check
  CHECK (shape_type IN ('circle', 'square', 'triangle', 'house', 'smiley', 'heart'));
