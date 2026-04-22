import type { AllFeatures, FeatureComparison, RawSignatureData } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { compareFeatures } from './biometric-score.js';
import { computeDtwSimilarityAgainstSamples } from './dtw.js';

/**
 * Score a signature verification attempt against a user's enrolled baseline
 * + raw stroke samples, using score-level fusion of the feature-based matcher
 * and the DTW-based sequence matcher.
 *
 * Motivation: the feature-based score summarizes each signature as a bag of
 * ~40 statistics and compares statistic-to-statistic. A skilled forger can
 * match averages while completely scrambling the sequence. DTW aligns the
 * full (x, y, pressure, velocity) trajectories point-by-point and catches
 * that case. The sum-rule fusion (Fierrez-Aguilar 2005, Kholmatov & Yanikoglu
 * 2005) consistently outperforms either matcher alone by 1-3 EER percentage
 * points on SVC-2004 / MCYT-100.
 *
 * Graceful degradation: when `enrollmentStrokes` is empty (no raw samples
 * retained — shouldn't happen post-v3 but defensive), the fusion collapses
 * to pure feature-based scoring. `dtwScore` / `dtwScores` are then omitted
 * from the returned comparison, signaling "DTW wasn't available for this
 * attempt" to diagnostics.
 */
export function scoreSignatureAttempt(
  baseline: AllFeatures,
  baselineStdDevs: Record<string, number>,
  enrollmentStrokes: RawSignatureData[],
  attempt: RawSignatureData,
  attemptFeatures: AllFeatures,
): FeatureComparison {
  // Feature score — existing path. Still enforces FEATURE_VERSION match.
  const featureComparison = compareFeatures(baseline, attemptFeatures, baselineStdDevs);
  const featureScore = featureComparison.score;

  if (enrollmentStrokes.length === 0) {
    // No raw samples to align against. Feature-only; signal degradation
    // by returning featureScore as-is without dtw fields.
    return {
      ...featureComparison,
      featureScore,
    };
  }

  const dtw = computeDtwSimilarityAgainstSamples(enrollmentStrokes, attempt);
  const w = THRESHOLDS.DTW_FUSION_WEIGHT;
  const fused = w * dtw.best + (1 - w) * featureScore;

  return {
    ...featureComparison,
    score: Math.round(fused * 100) / 100,
    featureScore: Math.round(featureScore * 100) / 100,
    dtwScore: Math.round(dtw.best * 100) / 100,
    dtwScores: dtw.perSample.map(s => Math.round(s * 100) / 100),
  };
}
