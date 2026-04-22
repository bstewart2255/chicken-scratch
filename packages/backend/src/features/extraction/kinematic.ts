import type { Stroke, StrokePoint, KinematicFeatures } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, mean, stddev } from './helpers/math.js';

/**
 * v3 NEW bucket: Kinematic features — velocity + acceleration (6 features).
 *
 * Velocity is the single most-replicated discriminative feature in online
 * signature verification (Nelson & Kishon 1991 onward). Acceleration is
 * particularly hard to forge because skilled forgers tend to draw slowly
 * and deliberately, flattening their acceleration profile compared to a
 * natural signer's.
 *
 * All features are in normalized units of (px / ms) for velocity and
 * (px / ms^2) for acceleration. They're scale-dependent on the input
 * canvas — comparisons only make sense between captures of the same
 * signature, which is what the matcher does.
 */
export function extractKinematicFeatures(strokes: Stroke[]): KinematicFeatures {
  const velocities: number[] = [];
  const accelerations: number[] = [];
  const penDownVelocities: number[] = [];

  const penDownWindow = THRESHOLDS.PEN_DOWN_WINDOW_POINTS;

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 2) continue;

    // Per-segment velocity. Segment i is between points[i] and points[i+1].
    const strokeVels: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      strokeVels.push(segmentVelocity(pts[i - 1], pts[i]));
    }
    velocities.push(...strokeVels);

    // "Pen-down" velocity: average velocity over the first N segments of
    // each stroke. Approximates how fast the hand is moving when it lands.
    const penDownEnd = Math.min(penDownWindow, strokeVels.length);
    if (penDownEnd > 0) {
      const penDown = strokeVels.slice(0, penDownEnd);
      penDownVelocities.push(mean(penDown));
    }

    // Per-segment acceleration = |v[i+1] - v[i]| / dt, with dt bridging the
    // midpoints of consecutive segments. Using the abs value because sign
    // of acceleration isn't useful as an aggregate feature (it cancels out
    // across speeding-up and slowing-down segments).
    for (let i = 1; i < strokeVels.length; i++) {
      const dt = Math.max(1, pts[i + 1].timestamp - pts[i - 1].timestamp) / 2;
      accelerations.push(Math.abs(strokeVels[i] - strokeVels[i - 1]) / dt);
    }
  }

  return {
    velocityAvg: mean(velocities),
    velocityMax: velocities.length > 0 ? Math.max(...velocities) : 0,
    velocityStd: stddev(velocities),
    velocityAtPenDown: mean(penDownVelocities),
    accelerationAvg: mean(accelerations),
    accelerationMax: accelerations.length > 0 ? Math.max(...accelerations) : 0,
  };
}

function segmentVelocity(a: StrokePoint, b: StrokePoint): number {
  const dt = Math.max(1, b.timestamp - a.timestamp);
  return distance(a, b) / dt;
}
