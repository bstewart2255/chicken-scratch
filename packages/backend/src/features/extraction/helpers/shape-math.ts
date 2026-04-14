import type { StrokePoint } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, angleBetweenVectors } from './math.js';

export interface Corner {
  index: number;
  point: StrokePoint;
  angle: number;
}

/**
 * Detect corners in a point sequence by finding sharp angle changes.
 * Scans with a window, marks a point as corner if angle exceeds threshold
 * and is a local maximum within ±2 points.
 */
export function detectCorners(
  points: StrokePoint[],
  angleThreshold: number = THRESHOLDS.CORNER_DETECTION_ANGLE_RAD,
  windowSize: number = THRESHOLDS.CORNER_WINDOW,
): Corner[] {
  if (points.length < windowSize * 2 + 1) return [];

  const angles: number[] = new Array(points.length).fill(0);

  for (let i = windowSize; i < points.length - windowSize; i++) {
    angles[i] = Math.abs(calculateAngleChange(points, i, windowSize));
  }

  const corners: Corner[] = [];
  for (let i = windowSize; i < points.length - windowSize; i++) {
    if (angles[i] < angleThreshold) continue;

    // Check local maximum within ±2 points
    let isMax = true;
    for (let j = Math.max(windowSize, i - 2); j <= Math.min(points.length - windowSize - 1, i + 2); j++) {
      if (j !== i && angles[j] > angles[i]) {
        isMax = false;
        break;
      }
    }

    if (isMax) {
      corners.push({ index: i, point: points[i], angle: angles[i] });
    }
  }

  return corners;
}

/**
 * Calculate the angle change at a point using vectors from window neighbors.
 */
export function calculateAngleChange(
  points: StrokePoint[],
  index: number,
  windowSize: number,
): number {
  const prev = points[index - windowSize];
  const curr = points[index];
  const next = points[index + windowSize];

  const v1x = curr.x - prev.x;
  const v1y = curr.y - prev.y;
  const v2x = next.x - curr.x;
  const v2y = next.y - curr.y;

  return angleBetweenVectors(v1x, v1y, v2x, v2y);
}

/**
 * Calculate total path length of a point sequence.
 */
export function calculatePathLength(points: StrokePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i - 1], points[i]);
  }
  return length;
}

/**
 * Perpendicular distance from a point to a line defined by two endpoints.
 */
export function pointToLineDistance(
  point: StrokePoint,
  lineStart: StrokePoint,
  lineEnd: StrokePoint,
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLenSq = dx * dx + dy * dy;
  if (lineLenSq === 0) return distance(point, lineStart);

  const area = Math.abs(
    (lineEnd.x - lineStart.x) * (lineStart.y - point.y) -
    (lineStart.x - point.x) * (lineEnd.y - lineStart.y)
  );
  return area / Math.sqrt(lineLenSq);
}

/**
 * Average perpendicular deviation of points between two endpoints from
 * the straight line connecting them.
 */
export function calculateLineDeviation(points: StrokePoint[], startIdx: number, endIdx: number): number {
  if (endIdx - startIdx < 2) return 0;
  const lineStart = points[startIdx];
  const lineEnd = points[endIdx];
  let totalDev = 0;
  let count = 0;
  for (let i = startIdx + 1; i < endIdx; i++) {
    totalDev += pointToLineDistance(points[i], lineStart, lineEnd);
    count++;
  }
  return count > 0 ? totalDev / count : 0;
}

/**
 * Calculate the centroid of a set of points.
 */
export function centroid(points: StrokePoint[]): { x: number; y: number } {
  let sx = 0, sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}
