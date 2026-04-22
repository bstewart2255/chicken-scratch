import type { Stroke, DiagnosticFlags } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, mean, stddev } from './helpers/math.js';

/**
 * Anomaly / authenticity flags (3 signals).
 *
 * v3: previously `SecurityFeatures`, included as a bucket in the biometric
 * matcher. Demoted to diagnostic signals because these are derived meta-scores
 * computed from the same timing/velocity signal that already feeds the timing
 * and kinematic buckets — including them in the matcher double-counts
 * information.
 *
 * Still useful for fraud review, admin dashboards, and future ensemble scoring;
 * exposed via `FeatureComparison.diagnosticFlags` on the verify response.
 */
export function extractDiagnosticFlags(strokes: Stroke[]): DiagnosticFlags {
  // Speed anomaly: low variance in segment speed suggests bot / tracer.
  const segmentSpeeds: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i].timestamp - pts[i - 1].timestamp;
      if (dt > 0) {
        segmentSpeeds.push(distance(pts[i - 1], pts[i]) / dt);
      }
    }
  }

  const avgSpeed = mean(segmentSpeeds);
  const speedStd = stddev(segmentSpeeds);
  // Coefficient of variation. Low = suspiciously uniform.
  const speedCV = avgSpeed > 0 ? speedStd / avgSpeed : 0;
  const speedAnomalyScore = speedCV < THRESHOLDS.SPEED_ANOMALY_THRESHOLD
    ? 1 - (speedCV / THRESHOLDS.SPEED_ANOMALY_THRESHOLD)
    : 0;

  // Timing regularity: inter-point timing consistency.
  const timingIntervals: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 1; i < pts.length; i++) {
      timingIntervals.push(pts[i].timestamp - pts[i - 1].timestamp);
    }
  }
  const timingStd = stddev(timingIntervals);
  const avgTiming = mean(timingIntervals);
  const timingCV = avgTiming > 0 ? timingStd / avgTiming : 0;
  // Natural writing has moderate CV (0.1-2.0). Outside that range is suspicious.
  const timingRegularityScore = timingCV >= 0.1 && timingCV <= 2.0
    ? 1.0
    : Math.max(0, 1 - Math.abs(timingCV - 1.0));

  // Behavioral authenticity: combined heuristic — natural speed variation,
  // natural timing variation, and non-trivial duration.
  const hasNaturalSpeed = speedCV > 0.1;
  const hasNaturalTiming = timingCV > 0.1 && timingCV < 3.0;
  const hasReasonableDuration = strokes.length > 0 &&
    (strokes[strokes.length - 1].endTime - strokes[0].startTime) > 100;

  let authenticity = 0;
  if (hasNaturalSpeed) authenticity += 0.4;
  if (hasNaturalTiming) authenticity += 0.4;
  if (hasReasonableDuration) authenticity += 0.2;

  return {
    speedAnomalyScore,
    timingRegularityScore,
    behavioralAuthenticityScore: authenticity,
  };
}
