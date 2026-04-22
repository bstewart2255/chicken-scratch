import type { AllFeatures, FeatureComparison } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';

/**
 * Error thrown when baseline and attempt were extracted under different
 * feature versions. The runtime guard prevents silently-wrong scores when
 * the feature set is mid-migration. Callers should surface a "please
 * re-enroll" UX when they catch this.
 */
export class FeatureVersionMismatchError extends Error {
  readonly baselineVersion: string;
  readonly attemptVersion: string;
  constructor(baselineVersion: string, attemptVersion: string) {
    super(
      `Feature version mismatch: baseline=${baselineVersion}, attempt=${attemptVersion}. ` +
      `Baseline was computed under a different feature schema and cannot be compared. ` +
      `User must re-enroll.`,
    );
    this.name = 'FeatureVersionMismatchError';
    this.baselineVersion = baselineVersion;
    this.attemptVersion = attemptVersion;
  }
}

// Tolerance multiplier for Mahalanobis-style scaling. Attempts within
// `k * stddev` of the baseline score near 1.0; beyond `k * stddev` the
// similarity falls off linearly to 0. Raised from the initial 2.5 to 3.0
// after the first prod genuine verify collapsed under the tighter bound —
// biometric data is noisier than a strict 2.5-sigma gate allows for.
const MAHALANOBIS_K = 3.0;

// Minimum absolute stddev used in the tolerance floor. Prevents divide-by-
// zero on features that happened to be identical across all N enrollment
// samples (common for discrete counts like strokeCount on a user who always
// draws with 1 stroke).
const MIN_ABS_STDDEV = 1e-3;

// Fractional floor on tolerance relative to baseline magnitude. Ensures
// even a "zero variance" feature gets at least this fraction of its
// baseline magnitude as tolerance. Raised from 5% to 10% after observing
// that demo single-sample enrollments were hitting the floor and failing
// on features whose true per-user variance is higher.
const MIN_REL_STDDEV = 0.10;

/**
 * Per-user variance-scaled similarity for a single feature.
 *
 * Returns a 0-1 score:
 *   attempt == baseline         → 1.0
 *   |attempt - baseline| == k·σ → 0.0
 *   beyond k·σ                  → 0.0 (clamped)
 *
 * The effective stddev is floored to avoid pathological cases where the
 * user's enrollments happened to be identical (σ = 0), which would otherwise
 * demand exact-match verification. Floor = max(MIN_ABS_STDDEV, MIN_REL_STDDEV·|baseline|).
 *
 * When `stored_stddev` is undefined (baseline pre-dates Mahalanobis wiring,
 * or a feature was added without a std-dev entry), falls back to the old
 * relative-error formula — `1 - |a - b| / max(|a|, |b|)` — so ungated
 * comparisons don't silently score 0.
 */
function featureSimilarityMahalanobis(
  stored: number,
  attempt: number,
  storedStddev: number | undefined,
): number {
  if (storedStddev === undefined) {
    // Forward-compat fallback: old relative-error formula.
    const maxVal = Math.max(Math.abs(stored), Math.abs(attempt));
    if (maxVal === 0) return 1;
    return Math.max(0, 1 - Math.abs(stored - attempt) / maxVal);
  }

  const absFloor = MIN_ABS_STDDEV;
  const relFloor = MIN_REL_STDDEV * Math.abs(stored);
  const effectiveStddev = Math.max(storedStddev, absFloor, relFloor);
  const tolerance = MAHALANOBIS_K * effectiveStddev;

  if (tolerance === 0) {
    // Shouldn't happen given the floor, but defensive.
    return stored === attempt ? 1 : 0;
  }

  const diff = Math.abs(stored - attempt);
  return Math.max(0, 1 - diff / tolerance);
}

/**
 * Average similarity across all numeric fields of two objects.
 * `stdDevs` is the pre-computed per-feature stddev map from the baseline
 * row, keyed "<bucket>.<feature>" (e.g. "timing.rhythmConsistency").
 */
function objectSimilarity(
  stored: Record<string, number>,
  attempt: Record<string, number>,
  stdDevs: Record<string, number> | undefined,
  bucketPrefix: string,
): number {
  const keys = Object.keys(stored);
  if (keys.length === 0) return 0;
  let total = 0;
  for (const key of keys) {
    const stdKey = `${bucketPrefix}.${key}`;
    const std = stdDevs?.[stdKey];
    total += featureSimilarityMahalanobis(stored[key], attempt[key] ?? 0, std);
  }
  return total / keys.length;
}

/**
 * Compare biometric features between a stored baseline and an authentication
 * attempt. Returns a 0-100 score with per-bucket breakdown.
 *
 * The optional `stdDevs` parameter enables per-user Mahalanobis-style variance
 * scaling: features that vary a lot across the user's enrollment samples get
 * more tolerance on the attempt, and features the user draws consistently
 * get tighter tolerance. Keys are "<bucket>.<feature>" (e.g. "timing.rhythmConsistency").
 * When `stdDevs` is omitted or a specific key is missing, the matcher falls
 * back to the old relative-error formula for that feature.
 *
 * Throws FeatureVersionMismatchError if the two sides were extracted under
 * different feature-schema versions.
 */
export function compareFeatures(
  baseline: AllFeatures,
  attempt: AllFeatures,
  stdDevs?: Record<string, number>,
): FeatureComparison {
  const baselineVersion = baseline.metadata?.featureVersion ?? 'unknown';
  const attemptVersion = attempt.metadata?.featureVersion ?? THRESHOLDS.FEATURE_VERSION;
  if (baselineVersion !== attemptVersion) {
    throw new FeatureVersionMismatchError(baselineVersion, attemptVersion);
  }

  let pressureScore: number | null = null;
  if (baseline.pressure && attempt.pressure) {
    pressureScore = objectSimilarity(
      baseline.pressure as unknown as Record<string, number>,
      attempt.pressure as unknown as Record<string, number>,
      stdDevs,
      'pressure',
    );
  }

  const timingScore = objectSimilarity(
    baseline.timing as unknown as Record<string, number>,
    attempt.timing as unknown as Record<string, number>,
    stdDevs,
    'timing',
  );

  const kinematicScore = objectSimilarity(
    baseline.kinematic as unknown as Record<string, number>,
    attempt.kinematic as unknown as Record<string, number>,
    stdDevs,
    'kinematic',
  );

  const geometricScore = objectSimilarity(
    baseline.geometric as unknown as Record<string, number>,
    attempt.geometric as unknown as Record<string, number>,
    stdDevs,
    'geometric',
  );

  const score = pressureScore !== null
    ? (pressureScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.pressure +
       timingScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.timing +
       kinematicScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.kinematic +
       geometricScore * THRESHOLDS.WEIGHT_WITH_PRESSURE.geometric) * 100
    : (timingScore * THRESHOLDS.WEIGHT_NO_PRESSURE.timing +
       kinematicScore * THRESHOLDS.WEIGHT_NO_PRESSURE.kinematic +
       geometricScore * THRESHOLDS.WEIGHT_NO_PRESSURE.geometric) * 100;

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      pressure: pressureScore !== null ? Math.round(pressureScore * 100 * 100) / 100 : null,
      timing: Math.round(timingScore * 100 * 100) / 100,
      kinematic: Math.round(kinematicScore * 100 * 100) / 100,
      geometric: Math.round(geometricScore * 100 * 100) / 100,
    },
    diagnosticFlags: attempt.diagnosticFlags,
  };
}

// Exported for tests.
export const __test__ = {
  featureSimilarityMahalanobis,
  MAHALANOBIS_K,
  MIN_ABS_STDDEV,
  MIN_REL_STDDEV,
};
