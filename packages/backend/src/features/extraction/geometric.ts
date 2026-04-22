import type { Stroke, GeometricFeatures, StrokePoint } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, angleBetweenVectors, mean, curvature, boundingBox } from './helpers/math.js';
import { allPoints } from './helpers/stroke-parser.js';

/**
 * Phase 3: Geometric / Shape-of-Trace Features (17 features in v3).
 *
 * v3 changes:
 *   Dropped `spatialEfficiency` (replaced with explicit bbox width/height/aspect
 *     /centroid — they're the canonical layout features in DSV literature).
 *   Added: bboxWidth, bboxHeight, aspectRatio, centroidX, centroidY,
 *          strokeCount, penDownCount, penUpCount, criticalPointCount,
 *          directionHist0..7 (8-bin direction histogram).
 */
export function extractGeometricFeatures(strokes: Stroke[]): GeometricFeatures {
  const points = allPoints(strokes);

  // ── Stroke complexity: pathLength / directDistance (averaged across strokes)
  const complexities: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 2) continue;
    const directDist = distance(pts[0], pts[pts.length - 1]);
    if (directDist === 0) continue;
    let pathLen = 0;
    for (let i = 1; i < pts.length; i++) {
      pathLen += distance(pts[i - 1], pts[i]);
    }
    complexities.push(pathLen / directDist);
  }

  // ── Tremor index: proportion of segments with angle change > PI/6
  let tremorSegments = 0;
  let totalSegments = 0;
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 2; i < pts.length; i++) {
      const v1x = pts[i - 1].x - pts[i - 2].x;
      const v1y = pts[i - 1].y - pts[i - 2].y;
      const v2x = pts[i].x - pts[i - 1].x;
      const v2y = pts[i].y - pts[i - 1].y;
      const angle = Math.abs(angleBetweenVectors(v1x, v1y, v2x, v2y));
      totalSegments++;
      if (angle > THRESHOLDS.TREMOR_ANGLE_RAD) {
        tremorSegments++;
      }
    }
  }
  const tremorIndex = totalSegments > 0 ? tremorSegments / totalSegments : 0;

  // ── Smoothness index: 1 / (1 + avgAngleChange)
  const angleChanges: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 2; i < pts.length; i++) {
      const v1x = pts[i - 1].x - pts[i - 2].x;
      const v1y = pts[i - 1].y - pts[i - 2].y;
      const v2x = pts[i].x - pts[i - 1].x;
      const v2y = pts[i].y - pts[i - 1].y;
      angleChanges.push(Math.abs(angleBetweenVectors(v1x, v1y, v2x, v2y)));
    }
  }
  const smoothnessIndex = 1 / (1 + mean(angleChanges));

  // ── Direction changes: count of angle changes > PI/4 per stroke, averaged
  const dirChangesPerStroke: number[] = [];
  for (const stroke of strokes) {
    let count = 0;
    const pts = stroke.points;
    for (let i = 2; i < pts.length; i++) {
      const v1x = pts[i - 1].x - pts[i - 2].x;
      const v1y = pts[i - 1].y - pts[i - 2].y;
      const v2x = pts[i].x - pts[i - 1].x;
      const v2y = pts[i].y - pts[i - 1].y;
      if (Math.abs(angleBetweenVectors(v1x, v1y, v2x, v2y)) > THRESHOLDS.DIRECTION_CHANGE_ANGLE_RAD) {
        count++;
      }
    }
    if (pts.length > 2) {
      dirChangesPerStroke.push(count);
    }
  }

  // ── Curvature analysis: average 3-point curvature across all points
  const curvatures: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 1; i < pts.length - 1; i++) {
      curvatures.push(curvature(pts[i - 1], pts[i], pts[i + 1]));
    }
  }

  // ── Bounding-box geometry (v3: replaces spatialEfficiency)
  const bbox = boundingBox(points);
  const bboxWidth = bbox.width;
  const bboxHeight = bbox.height;
  // Avoid div-by-zero on single-point or perfectly-vertical/horizontal traces.
  const aspectRatio = bboxHeight > 0 ? bboxWidth / bboxHeight : 0;
  // Normalized centroid relative to bbox (0-1). Where the ink is in the box,
  // not where the box is on the canvas — more robust to different canvas sizes.
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = points.length > 0 ? sumX / points.length : 0;
  const meanY = points.length > 0 ? sumY / points.length : 0;
  const centroidX = bboxWidth > 0 ? (meanX - bbox.minX) / bboxWidth : 0.5;
  const centroidY = bboxHeight > 0 ? (meanY - bbox.minY) / bboxHeight : 0.5;

  // ── Stroke structure counts (v3)
  const strokeCount = strokes.length;
  // For pointer input, each stroke is one pen-down; pen-ups = strokes - 1.
  const penDownCount = strokeCount;
  const penUpCount = Math.max(0, strokeCount - 1);

  // ── Stroke overlap ratio: point pairs < 5px apart from different strokes / total points
  let overlapCount = 0;
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const step1 = Math.max(1, Math.floor(strokes[i].points.length / 50));
      const step2 = Math.max(1, Math.floor(strokes[j].points.length / 50));
      for (let pi = 0; pi < strokes[i].points.length; pi += step1) {
        for (let pj = 0; pj < strokes[j].points.length; pj += step2) {
          if (distance(strokes[i].points[pi], strokes[j].points[pj]) < THRESHOLDS.OVERLAP_DISTANCE_PX) {
            overlapCount++;
          }
        }
      }
    }
  }
  const strokeOverlapRatio = points.length > 0 ? overlapCount / points.length : 0;

  // ── Direction histogram (v3): 8 bins over [0, 2π), weighted by segment duration
  // Each segment between consecutive points is classified by its angle and
  // contributes its time-length to the corresponding bin. Bins are normalized
  // to sum to 1 so the histogram is comparable across samples of different length.
  const dirBins = new Array<number>(8).fill(0);
  let totalDirTime = 0;
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      if (dx === 0 && dy === 0) continue;
      const dt = Math.max(1, pts[i].timestamp - pts[i - 1].timestamp);
      // atan2 returns [-π, π]; shift to [0, 2π) for bin indexing.
      const theta = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
      const bin = Math.min(7, Math.floor((theta / (2 * Math.PI)) * 8));
      dirBins[bin] += dt;
      totalDirTime += dt;
    }
  }
  if (totalDirTime > 0) {
    for (let i = 0; i < 8; i++) dirBins[i] /= totalDirTime;
  }

  // ── Critical point count (v3): local velocity minima across the whole trace.
  // Literature uses these as pen-signature anchors — skilled forgers struggle
  // to reproduce both their count and their placement. Here we just return
  // the count; placement is implicitly captured by velocityAtPenDown and DTW.
  const criticalPointCount = countVelocityMinima(strokes);

  return {
    strokeComplexity: mean(complexities),
    tremorIndex,
    smoothnessIndex,
    directionChanges: mean(dirChangesPerStroke),
    curvatureAnalysis: mean(curvatures),
    strokeOverlapRatio,
    bboxWidth,
    bboxHeight,
    aspectRatio,
    centroidX,
    centroidY,
    strokeCount,
    penDownCount,
    penUpCount,
    criticalPointCount,
    directionHist0: dirBins[0],
    directionHist1: dirBins[1],
    directionHist2: dirBins[2],
    directionHist3: dirBins[3],
    directionHist4: dirBins[4],
    directionHist5: dirBins[5],
    directionHist6: dirBins[6],
    directionHist7: dirBins[7],
  };
}

function segmentVelocity(a: StrokePoint, b: StrokePoint): number {
  const dt = Math.max(1, b.timestamp - a.timestamp);
  return distance(a, b) / dt;
}

/**
 * Count local minima in the velocity time-series across all strokes.
 * A minimum is a segment where velocity is lower than both its predecessor
 * and its successor. Windowed with a single-step comparison; more robust
 * smoothing can be layered in later if empirical noise warrants it.
 */
function countVelocityMinima(strokes: Stroke[]): number {
  let count = 0;
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 4) continue;
    const vels: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      vels.push(segmentVelocity(pts[i - 1], pts[i]));
    }
    for (let i = 1; i < vels.length - 1; i++) {
      if (vels[i] < vels[i - 1] && vels[i] < vels[i + 1]) {
        count++;
      }
    }
  }
  return count;
}
