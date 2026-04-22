import type { Stroke, TimingFeatures } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { mean, stddev, distance } from './helpers/math.js';
import { allPoints } from './helpers/stroke-parser.js';

/**
 * Phase 2: Behavioral Timing Features (9 features).
 *
 * v3: dropped `pauseDetection` (raw count — redundant with `pauseTimeRatio`);
 *     added `penUpDurationMean` + `penUpDurationStd` for per-stroke-gap stats.
 */
export function extractTimingFeatures(strokes: Stroke[]): TimingFeatures {
  const points = allPoints(strokes);

  // Drawing duration total
  const firstTime = points.length > 0 ? points[0].timestamp : 0;
  const lastTime = points.length > 0 ? points[points.length - 1].timestamp : 0;
  const drawingDurationTotal = lastTime - firstTime;

  // Inter-stroke (pen-up) gaps
  const interStrokeGaps: number[] = [];
  let totalPauseTime = 0;

  for (let i = 1; i < strokes.length; i++) {
    const prevEnd = strokes[i - 1].endTime;
    const currStart = strokes[i].startTime;
    const gap = currStart - prevEnd;
    interStrokeGaps.push(gap);
    if (gap > THRESHOLDS.PAUSE_DETECTION_MS) {
      totalPauseTime += gap;
    }
  }

  // Stroke durations
  const strokeDurations = strokes
    .map(s => s.endTime - s.startTime)
    .filter(d => d > 0);

  // Rhythm consistency: stddev of stroke durations
  const rhythmConsistency = stddev(strokeDurations);

  // Tempo variation: avg |duration[i] - duration[i-1]|
  const tempoChanges: number[] = [];
  for (let i = 1; i < strokeDurations.length; i++) {
    tempoChanges.push(Math.abs(strokeDurations[i] - strokeDurations[i - 1]));
  }

  // Dwell time patterns: points with movement < threshold px in > threshold ms
  let dwellCount = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.points.length; i++) {
      const dt = stroke.points[i].timestamp - stroke.points[i - 1].timestamp;
      const dist = distance(stroke.points[i - 1], stroke.points[i]);
      if (dt > THRESHOLDS.DWELL_TIME_MS && dist < THRESHOLDS.DWELL_DISTANCE_PX) {
        dwellCount++;
      }
    }
  }
  const dwellTimePatterns = points.length > 0 ? dwellCount / points.length : 0;

  return {
    rhythmConsistency,
    tempoVariation: mean(tempoChanges),
    dwellTimePatterns,
    interStrokeTiming: mean(interStrokeGaps),
    drawingDurationTotal,
    pauseTimeRatio: drawingDurationTotal > 0 ? totalPauseTime / drawingDurationTotal : 0,
    avgStrokeDuration: mean(strokeDurations),
    penUpDurationMean: mean(interStrokeGaps),
    penUpDurationStd: stddev(interStrokeGaps),
  };
}
