-- Feature schema v3 migration.
--
-- Drops the v2 feature-averaged baselines and the raw samples that computed
-- them, because the feature vector has changed shape:
--   - pressureRange, pauseDetection, spatialEfficiency removed (redundant)
--   - SecurityFeatures bucket demoted out of the matcher to diagnosticFlags
--   - New kinematic bucket (velocity + acceleration)
--   - Geometric bucket gains bbox/centroid/pen-counts/critical-points/dir-hist
--   - Timing bucket gains pen-up duration stats
--
-- The comparison function (compareFeatures in biometric-score.ts) now enforces
-- a runtime FEATURE_VERSION match between baseline and attempt. Any v2 baseline
-- still on disk would throw FeatureVersionMismatchError on the next verify,
-- forcing a re-enrollment UX. Truncating here is cleaner: empty prod at the
-- time of the v3 release (confirmed via GET /api/diagnostics/users → []),
-- plus any local/staging demo users re-enroll when they next log in.
--
-- This migration also removes auth_attempts because attempt rows reference
-- scoring breakdowns whose shape changed (dropped `security`, added `kinematic`).
-- Leaving them would corrupt the diagnostics dashboard for historical rows.

-- Order matters: remove dependent rows before the users' baselines.
TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE;
TRUNCATE TABLE shape_samples RESTART IDENTITY CASCADE;
TRUNCATE TABLE shape_baselines RESTART IDENTITY CASCADE;
TRUNCATE TABLE enrollment_samples RESTART IDENTITY CASCADE;
TRUNCATE TABLE baselines RESTART IDENTITY CASCADE;

-- Flip all still-existing user rows back to un-enrolled so the frontend
-- prompts them through the re-enrollment flow cleanly. (In practice the
-- admin deletion pass earlier this release cleared users too, so this is
-- belt-and-suspenders.)
UPDATE users SET enrolled = FALSE;
