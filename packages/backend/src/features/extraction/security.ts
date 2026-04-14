import type { Stroke, SecurityFeatures } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, mean, stddev } from './helpers/math.js';

/**
 * Phase 4: Security & Context Features (3 features)
 * Detects signs of forgery or unnatural drawing behavior.
 */
export function extractSecurityFeatures(strokes: Stroke[]): SecurityFeatures {
  // Speed anomaly score: proportion of segments with unnaturally consistent speed
  // Real humans have speed variation; robots/tracers tend to be uniform
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
  // Low coefficient of variation = suspiciously uniform speed
  const speedCV = avgSpeed > 0 ? speedStd / avgSpeed : 0;
  // Score 0 = natural variation, approaching 1 = suspiciously uniform
  const speedAnomalyScore = speedCV < THRESHOLDS.SPEED_ANOMALY_THRESHOLD
    ? 1 - (speedCV / THRESHOLDS.SPEED_ANOMALY_THRESHOLD)
    : 0;

  // Timing regularity score: how consistent are inter-point timing intervals
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
  // Natural writing has moderate variation (CV 0.3-0.8)
  // Too regular (< 0.1) or too chaotic (> 2.0) is suspicious
  const timingRegularityScore = timingCV >= 0.1 && timingCV <= 2.0
    ? 1.0
    : Math.max(0, 1 - Math.abs(timingCV - 1.0));

  // Behavioral authenticity: combined heuristic
  // Checks for: natural speed variation, timing variation, non-zero duration
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
