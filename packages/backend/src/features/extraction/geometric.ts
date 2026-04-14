import type { Stroke, GeometricFeatures } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, angleBetweenVectors, mean, curvature, boundingBox } from './helpers/math.js';
import { allPoints } from './helpers/stroke-parser.js';

/**
 * Phase 3: Advanced Geometric Features (7 features)
 */
export function extractGeometricFeatures(strokes: Stroke[]): GeometricFeatures {
  const points = allPoints(strokes);

  // Stroke complexity: pathLength / directDistance (averaged across strokes)
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

  // Tremor index: proportion of segments with angle change > PI/6
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

  // Smoothness index: 1 / (1 + avgAngleChange)
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

  // Direction changes: count of angle changes > PI/4 per stroke, averaged
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

  // Curvature analysis: average 3-point curvature across all points
  const curvatures: number[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    for (let i = 1; i < pts.length - 1; i++) {
      curvatures.push(curvature(pts[i - 1], pts[i], pts[i + 1]));
    }
  }

  // Spatial efficiency: totalInkLength / sqrt(boundingArea)
  let totalInkLength = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.points.length; i++) {
      totalInkLength += distance(stroke.points[i - 1], stroke.points[i]);
    }
  }
  const bbox = boundingBox(points);
  const spatialEfficiency = bbox.area > 0 ? totalInkLength / Math.sqrt(bbox.area) : 0;

  // Stroke overlap ratio: point pairs < 5px apart from different strokes / total points
  let overlapCount = 0;
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      // Sample points to avoid O(n^2) explosion on large strokes
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

  return {
    strokeComplexity: mean(complexities),
    tremorIndex,
    smoothnessIndex,
    directionChanges: mean(dirChangesPerStroke),
    curvatureAnalysis: mean(curvatures),
    spatialEfficiency,
    strokeOverlapRatio,
  };
}
