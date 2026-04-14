import type { MLFeatureVector, RawSignatureData } from '@chicken-scratch/shared';
import { extractStrokes, allPoints } from '../extraction/helpers/stroke-parser.js';
import { distance, mean, stddev, boundingBox, velocity } from '../extraction/helpers/math.js';

/**
 * Extract the 19-feature ML vector used for scoring.
 */
export function extractMLFeatures(data: RawSignatureData): MLFeatureVector {
  const strokes = extractStrokes(data);
  const points = allPoints(strokes);

  const strokeCount = strokes.length;
  const totalPoints = points.length;

  // Duration
  const firstTime = points.length > 0 ? points[0].timestamp : 0;
  const lastTime = points.length > 0 ? points[points.length - 1].timestamp : 0;
  const totalDurationMs = lastTime - firstTime;

  const avgPointsPerStroke = strokeCount > 0 ? totalPoints / strokeCount : 0;

  // Velocities
  const velocities: number[] = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.points.length; i++) {
      velocities.push(velocity(stroke.points[i - 1], stroke.points[i]));
    }
  }
  const avgVelocity = mean(velocities);
  const maxVelocity = velocities.length > 0 ? Math.max(...velocities) : 0;
  const minVelocity = velocities.length > 0 ? Math.min(...velocities) : 0;
  const velocityStd = stddev(velocities);

  // Bounding box
  const bbox = points.length > 0 ? boundingBox(points) : { width: 0, height: 0, area: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };

  // Center
  const centerX = points.length > 0 ? mean(points.map(p => p.x)) : 0;
  const centerY = points.length > 0 ? mean(points.map(p => p.y)) : 0;

  // Stroke lengths
  const strokeLengths: number[] = [];
  let totalLength = 0;
  for (const stroke of strokes) {
    let len = 0;
    for (let i = 1; i < stroke.points.length; i++) {
      len += distance(stroke.points[i - 1], stroke.points[i]);
    }
    strokeLengths.push(len);
    totalLength += len;
  }

  // Stroke durations
  const strokeDurations = strokes.map(s => s.endTime - s.startTime);

  return {
    strokeCount,
    totalPoints,
    totalDurationMs,
    avgPointsPerStroke,
    avgVelocity,
    maxVelocity,
    minVelocity,
    velocityStd,
    width: bbox.width,
    height: bbox.height,
    area: bbox.area,
    aspectRatio: bbox.height > 0 ? bbox.width / bbox.height : 0,
    centerX,
    centerY,
    avgStrokeLength: mean(strokeLengths),
    totalLength,
    lengthVariation: stddev(strokeLengths),
    avgStrokeDuration: mean(strokeDurations),
    durationVariation: stddev(strokeDurations),
  };
}
