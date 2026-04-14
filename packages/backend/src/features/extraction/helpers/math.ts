import type { StrokePoint } from '@chicken-scratch/shared';

export function distance(a: StrokePoint, b: StrokePoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function angleBetweenVectors(
  v1x: number, v1y: number,
  v2x: number, v2y: number,
): number {
  const det = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  return Math.atan2(det, dot);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function boundingBox(points: StrokePoint[]): {
  minX: number; maxX: number; minY: number; maxY: number;
  width: number; height: number; area: number;
} {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, maxX, minY, maxY, width, height, area: width * height };
}

/** 3-point curvature: 4 * triangleArea / (a * b * c) */
export function curvature(p1: StrokePoint, p2: StrokePoint, p3: StrokePoint): number {
  const area = 0.5 * Math.abs(
    (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)
  );
  const a = distance(p1, p2);
  const b = distance(p2, p3);
  const c = distance(p1, p3);
  const denom = a * b * c;
  if (denom === 0) return 0;
  return (4 * area) / denom;
}

export function velocity(p1: StrokePoint, p2: StrokePoint): number {
  const dt = Math.abs(p2.timestamp - p1.timestamp);
  if (dt === 0) return 0;
  return distance(p1, p2) / dt;
}
