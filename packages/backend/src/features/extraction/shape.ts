import type { StrokePoint, ChallengeItemType, ShapeSpecificFeatures, CircleFeatures, SquareFeatures, TriangleFeatures, HouseFeatures, SmileyFeatures, HeartFeatures, Stroke } from '@chicken-scratch/shared';
import { THRESHOLDS } from '@chicken-scratch/shared';
import { distance, mean, stddev, boundingBox, curvature } from './helpers/math.js';
import { detectCorners, calculatePathLength, calculateLineDeviation, centroid, pointToLineDistance } from './helpers/shape-math.js';
import { allPoints } from './helpers/stroke-parser.js';

/**
 * Extract shape-specific features based on shape type.
 * Each shape type returns 4 features that capture how the user draws that shape.
 */
export function extractShapeSpecificFeatures(
  strokes: Stroke[],
  shapeType: ChallengeItemType,
): ShapeSpecificFeatures {
  const points = allPoints(strokes);
  if (points.length < 3) {
    return getDefaultFeatures(shapeType);
  }

  switch (shapeType) {
    case 'circle': return extractCircleFeatures(points);
    case 'square': return extractSquareFeatures(points);
    case 'triangle': return extractTriangleFeatures(points);
    case 'house': return extractHouseFeatures(strokes, points);
    case 'smiley': return extractSmileyFeatures(strokes, points);
    case 'heart': return extractHeartFeatures(points);
  }
}

// ─── Circle ──────────────────────────────────────────────────────────────────

function extractCircleFeatures(points: StrokePoint[]): CircleFeatures {
  const center = centroid(points);
  const radii = points.map(p => Math.sqrt((p.x - center.x) ** 2 + (p.y - center.y) ** 2));
  const avgRadius = mean(radii);

  // startPositionAnalysis: angular position where drawing begins (0-1)
  const first = points[0];
  const startAngle = Math.atan2(first.y - center.y, first.x - center.x);
  const startPositionAnalysis = (startAngle + Math.PI) / (2 * Math.PI); // normalize to 0-1

  // closureTechnique: how well start and end points meet (0-1)
  const last = points[points.length - 1];
  const gap = distance(first, last);
  const shapeSize = avgRadius * 2;
  const closureTechnique = shapeSize > 0 ? Math.max(0, 1 - gap / shapeSize) : 0;

  // curveConsistency: how uniform the angle changes are between segments
  const angleDiffs: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const v1x = points[i].x - points[i - 1].x;
    const v1y = points[i].y - points[i - 1].y;
    const v2x = points[i + 1].x - points[i].x;
    const v2y = points[i + 1].y - points[i].y;
    const angle = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
    angleDiffs.push(angle);
  }
  const curveConsistency = angleDiffs.length > 0 ? stddev(angleDiffs) : 0;

  // radialDeviation: how circular the shape is (lower = more circular)
  const radialDeviation = avgRadius > 0 ? stddev(radii) / avgRadius : 0;

  return { startPositionAnalysis, closureTechnique, curveConsistency, radialDeviation };
}

// ─── Square ──────────────────────────────────────────────────────────────────

function extractSquareFeatures(points: StrokePoint[]): SquareFeatures {
  const corners = detectCorners(points, THRESHOLDS.CORNER_THRESHOLD_SQUARE);

  // cornerExecution: consistency of corner angles (needs ≥4 corners)
  let cornerExecution = 0.5; // default if not enough corners
  if (corners.length >= 4) {
    const cornerAngles = corners.slice(0, 4).map(c => c.angle);
    cornerExecution = 1 / (1 + stddev(cornerAngles));
  }

  // lineStraightness: avg point-to-line deviation per edge segment
  let lineStraightness = 0;
  if (corners.length >= 4) {
    const deviations: number[] = [];
    const sortedCorners = corners.slice(0, 4).sort((a, b) => a.index - b.index);
    // Edges between consecutive corners
    for (let i = 0; i < sortedCorners.length; i++) {
      const start = sortedCorners[i].index;
      const end = sortedCorners[(i + 1) % sortedCorners.length].index;
      if (end > start) {
        deviations.push(calculateLineDeviation(points, start, end));
      }
    }
    lineStraightness = deviations.length > 0 ? mean(deviations) : 0;
  } else {
    // Fallback: divide into 4 segments
    const segLen = Math.floor(points.length / 4);
    const deviations: number[] = [];
    for (let i = 0; i < 4; i++) {
      const start = i * segLen;
      const end = Math.min((i + 1) * segLen, points.length - 1);
      deviations.push(calculateLineDeviation(points, start, end));
    }
    lineStraightness = mean(deviations);
  }

  // cornerPressureSpikes: pressure ratio at corners vs surrounding
  let cornerPressureSpikes = 1.0;
  if (corners.length >= 4) {
    const ratios: number[] = [];
    for (const corner of corners.slice(0, 4)) {
      const cornerPressure = corner.point.pressure;
      if (cornerPressure <= 0) continue;
      // Average pressure of surrounding points (±10 or available)
      const surroundStart = Math.max(0, corner.index - 10);
      const surroundEnd = Math.min(points.length - 1, corner.index + 10);
      const surrounding: number[] = [];
      for (let j = surroundStart; j <= surroundEnd; j++) {
        if (j !== corner.index && points[j].pressure > 0) {
          surrounding.push(points[j].pressure);
        }
      }
      if (surrounding.length > 0) {
        ratios.push(cornerPressure / mean(surrounding));
      }
    }
    cornerPressureSpikes = ratios.length > 0 ? mean(ratios) : 1.0;
  }

  // edgeLengthConsistency: how equal the edge lengths are
  let edgeLengthConsistency = 0.5;
  if (corners.length >= 4) {
    const sortedCorners = corners.slice(0, 4).sort((a, b) => a.index - b.index);
    const edgeLengths: number[] = [];
    for (let i = 0; i < sortedCorners.length; i++) {
      const next = sortedCorners[(i + 1) % sortedCorners.length];
      edgeLengths.push(distance(sortedCorners[i].point, next.point));
    }
    const avgLen = mean(edgeLengths);
    edgeLengthConsistency = avgLen > 0 ? 1 / (1 + stddev(edgeLengths) / avgLen) : 0;
  } else {
    // Fallback: use bounding box aspect ratio as proxy
    const bb = boundingBox(points);
    if (bb.width > 0 && bb.height > 0) {
      const ratio = Math.min(bb.width, bb.height) / Math.max(bb.width, bb.height);
      edgeLengthConsistency = ratio; // 1.0 = perfect square aspect
    }
  }

  return { cornerExecution, lineStraightness, cornerPressureSpikes, edgeLengthConsistency };
}

// ─── Triangle ────────────────────────────────────────────────────────────────

function extractTriangleFeatures(points: StrokePoint[]): TriangleFeatures {
  const corners = detectCorners(points);

  // angleConsistency: how close interior angles sum to PI
  let angleConsistency = 0.5;
  if (corners.length >= 3) {
    const top3 = corners.sort((a, b) => b.angle - a.angle).slice(0, 3);
    const angleSum = top3.reduce((sum, c) => sum + c.angle, 0);
    angleConsistency = 1 / (1 + Math.abs(angleSum - Math.PI) * 10);
  }

  // vertexPressure: pressure behavior at vertices
  let vertexPressure = 1.0;
  if (corners.length >= 3) {
    const top3 = corners.sort((a, b) => b.angle - a.angle).slice(0, 3);
    const avgPressure = mean(points.filter(p => p.pressure > 0).map(p => p.pressure));
    if (avgPressure > 0) {
      const ratios: number[] = [];
      for (const v of top3) {
        if (v.point.pressure > 0) {
          ratios.push(v.point.pressure / avgPressure);
        }
      }
      if (ratios.length > 0) {
        const avgRatio = mean(ratios);
        const ratioVariance = ratios.length > 1 ? stddev(ratios) : 0;
        vertexPressure = avgRatio * (1 / (1 + ratioVariance));
      }
    }
  }

  // sideLengthRatios: ratio pattern of sorted side lengths
  let sideLengthRatios = 1.0;
  if (corners.length >= 3) {
    const top3 = corners.sort((a, b) => a.index - b.index).slice(0, 3);
    const sides = [
      distance(top3[0].point, top3[1].point),
      distance(top3[1].point, top3[2].point),
      distance(top3[2].point, top3[0].point),
    ].sort((a, b) => a - b);
    if (sides[0] > 0 && sides[1] > 0) {
      sideLengthRatios = (sides[1] / sides[0]) * (sides[2] / sides[1]);
    }
  }

  // apexSharpness: average curvature at detected corners
  let apexSharpness = 0;
  if (corners.length >= 3) {
    const top3 = corners.sort((a, b) => b.angle - a.angle).slice(0, 3);
    const curvatures: number[] = [];
    for (const c of top3) {
      if (c.index > 0 && c.index < points.length - 1) {
        curvatures.push(curvature(points[c.index - 1], points[c.index], points[c.index + 1]));
      }
    }
    apexSharpness = curvatures.length > 0 ? mean(curvatures) : 0;
  }

  return { angleConsistency, vertexPressure, sideLengthRatios, apexSharpness };
}

// ─── House ──────────────────────────────────────────────────────────────────

/**
 * Extract house-specific features.
 * A house = rectangular base + triangular roof.
 * We segment by finding the topmost point (roof peak) and splitting upper/lower regions.
 */
function extractHouseFeatures(strokes: Stroke[], points: StrokePoint[]): HouseFeatures {
  const bb = boundingBox(points);
  if (bb.height === 0 || bb.width === 0) {
    return { roofToBaseRatio: 0.5, symmetryScore: 0.5, connectionTechnique: 0.5, lineStability: 0 };
  }

  // Find the roof peak: the topmost point (lowest y value)
  let peakIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y < points[peakIdx].y) peakIdx = i;
  }
  const peak = points[peakIdx];

  // Estimate where roof meets base: scan for the horizontal transition.
  // The base starts where points cluster at a consistent y-level below the peak.
  // Use a heuristic: the roof/base boundary is where the most corners are clustered
  // horizontally. Fallback: use the midpoint between peak and bottom.
  const corners = detectCorners(points, Math.PI / 5); // slightly more sensitive
  let baseLine = bb.minY + bb.height * 0.5; // fallback

  if (corners.length >= 4) {
    // Find the two corners closest to the peak's y-level but on either side of peak x
    // These are the eave points (where roof meets walls)
    const eaveCorners = corners
      .filter(c => c.point.y > peak.y + bb.height * 0.1) // below peak
      .sort((a, b) => a.point.y - b.point.y); // sort by y (topmost first)

    if (eaveCorners.length >= 2) {
      // Take the top 2-4 corners and average their y as the eave line
      const eaveY = mean(eaveCorners.slice(0, Math.min(4, eaveCorners.length)).map(c => c.point.y));
      baseLine = eaveY;
    }
  }

  // roofToBaseRatio: personal proportion preference
  const roofHeight = baseLine - bb.minY;
  const baseHeight = bb.maxY - baseLine;
  const roofToBaseRatio = (roofHeight + baseHeight) > 0
    ? roofHeight / (roofHeight + baseHeight)
    : 0.5;

  // symmetryScore: compare left vs right halves of the drawing
  const centerX = bb.minX + bb.width / 2;
  const leftPoints = points.filter(p => p.x < centerX);
  const rightPoints = points.filter(p => p.x >= centerX);

  let symmetryScore = 0.5;
  if (leftPoints.length > 0 && rightPoints.length > 0) {
    // Compare point count balance
    const countBalance = Math.min(leftPoints.length, rightPoints.length) /
      Math.max(leftPoints.length, rightPoints.length);

    // Compare vertical spread on each side
    const leftBB = boundingBox(leftPoints);
    const rightBB = boundingBox(rightPoints);
    const heightBalance = leftBB.height > 0 && rightBB.height > 0
      ? Math.min(leftBB.height, rightBB.height) / Math.max(leftBB.height, rightBB.height)
      : 0;

    symmetryScore = (countBalance + heightBalance) / 2;
  }

  // connectionTechnique: how well the roof connects to the base
  // Measure gaps at the junction region (around baseLine y-level)
  const junctionBand = bb.height * 0.1; // ±10% of height around baseline
  const junctionPoints = points.filter(p =>
    Math.abs(p.y - baseLine) < junctionBand
  );
  // More points in the junction = better connection
  const junctionDensity = junctionPoints.length / points.length;
  // Normalize: typical good connection has ~10-20% of points in junction
  const connectionTechnique = Math.min(1, junctionDensity / 0.15);

  // lineStability: avg deviation of points from straight-line segments between corners
  let lineStability = 0;
  if (corners.length >= 3) {
    const sorted = [...corners].sort((a, b) => a.index - b.index);
    const deviations: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const dev = calculateLineDeviation(points, sorted[i].index, sorted[i + 1].index);
      deviations.push(dev);
    }
    // Normalize by shape size — lower deviation = straighter lines
    const avgDev = deviations.length > 0 ? mean(deviations) : 0;
    const normDev = bb.width > 0 ? avgDev / bb.width : 0;
    lineStability = 1 / (1 + normDev * 10);
  } else {
    // Fallback: measure deviation in 5 equal segments
    const segLen = Math.floor(points.length / 5);
    const deviations: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = i * segLen;
      const end = Math.min((i + 1) * segLen, points.length - 1);
      if (end > start + 1) deviations.push(calculateLineDeviation(points, start, end));
    }
    const avgDev = deviations.length > 0 ? mean(deviations) : 0;
    const normDev = bb.width > 0 ? avgDev / bb.width : 0;
    lineStability = 1 / (1 + normDev * 10);
  }

  return { roofToBaseRatio, symmetryScore, connectionTechnique, lineStability };
}

// ─── Smiley ─────────────────────────────────────────────────────────────────

/**
 * Classify strokes into face outline vs internal features (eyes, mouth).
 * The face outline is typically the longest stroke or the one with the largest bounding box.
 */
function classifySmileyStrokes(strokes: Stroke[]): {
  faceStroke: Stroke | null;
  featureStrokes: Stroke[];
  faceStrokeIndex: number;
} {
  if (strokes.length === 0) return { faceStroke: null, featureStrokes: [], faceStrokeIndex: -1 };
  if (strokes.length === 1) return { faceStroke: strokes[0], featureStrokes: [], faceStrokeIndex: 0 };

  // Score each stroke by bounding box area * point count (face is big and detailed)
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < strokes.length; i++) {
    const bb = boundingBox(strokes[i].points);
    const score = bb.area * strokes[i].points.length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return {
    faceStroke: strokes[bestIdx],
    featureStrokes: strokes.filter((_, i) => i !== bestIdx),
    faceStrokeIndex: bestIdx,
  };
}

/**
 * Extract smiley-specific features.
 * A smiley = circular face outline + internal features (eyes, mouth).
 */
function extractSmileyFeatures(strokes: Stroke[], points: StrokePoint[]): SmileyFeatures {
  const bb = boundingBox(points);
  if (bb.height === 0 || bb.width === 0) {
    return { featurePlacement: 0.5, strokeSequencing: 0, facialSymmetry: 0.5, componentProportions: 0 };
  }

  const { faceStroke, featureStrokes, faceStrokeIndex } = classifySmileyStrokes(strokes);

  // Face center and size
  const faceCenter = faceStroke
    ? centroid(faceStroke.points)
    : centroid(points);
  const faceBB = faceStroke ? boundingBox(faceStroke.points) : bb;
  const faceDiameter = Math.max(faceBB.width, faceBB.height);

  // featurePlacement: where internal features sit relative to face center (normalized)
  let featurePlacement = 0.5;
  if (featureStrokes.length > 0) {
    const featurePoints = featureStrokes.flatMap(s => s.points);
    const featureCenter = centroid(featurePoints);
    // Distance from face center to feature centroid, normalized by face diameter
    const dx = featureCenter.x - faceCenter.x;
    const dy = featureCenter.y - faceCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    featurePlacement = faceDiameter > 0 ? dist / faceDiameter : 0.5;
  }

  // strokeSequencing: encode the draw order as a ratio
  // face-first (index 0) vs face-last vs face-middle
  // Normalized: 0 = drew face first, 1 = drew face last
  const strokeSequencing = strokes.length > 1
    ? faceStrokeIndex / (strokes.length - 1)
    : 0;

  // facialSymmetry: compare left vs right internal features relative to face center
  let facialSymmetry = 0.5;
  if (featureStrokes.length >= 2) {
    const leftFeatures = featureStrokes.filter(s => {
      const c = centroid(s.points);
      return c.x < faceCenter.x;
    });
    const rightFeatures = featureStrokes.filter(s => {
      const c = centroid(s.points);
      return c.x >= faceCenter.x;
    });

    if (leftFeatures.length > 0 && rightFeatures.length > 0) {
      // Compare bounding box areas of left vs right feature groups
      const leftArea = leftFeatures.reduce((sum, s) => sum + boundingBox(s.points).area, 0);
      const rightArea = rightFeatures.reduce((sum, s) => sum + boundingBox(s.points).area, 0);
      const areaBalance = (leftArea + rightArea) > 0
        ? Math.min(leftArea, rightArea) / Math.max(leftArea, rightArea)
        : 0;

      // Compare vertical positions of left vs right features
      const leftAvgY = mean(leftFeatures.flatMap(s => s.points).map(p => p.y));
      const rightAvgY = mean(rightFeatures.flatMap(s => s.points).map(p => p.y));
      const yDiff = Math.abs(leftAvgY - rightAvgY);
      const yBalance = faceBB.height > 0 ? Math.max(0, 1 - yDiff / (faceBB.height * 0.3)) : 0;

      facialSymmetry = (areaBalance + yBalance) / 2;
    }
  }

  // componentProportions: ratio of total feature area to face area
  let componentProportions = 0;
  if (featureStrokes.length > 0 && faceBB.area > 0) {
    const totalFeatureArea = featureStrokes.reduce((sum, s) => {
      const fbb = boundingBox(s.points);
      return sum + fbb.area;
    }, 0);
    componentProportions = totalFeatureArea / faceBB.area;
  }

  return { featurePlacement, strokeSequencing, facialSymmetry, componentProportions };
}

// ─── Heart ───────────────────────────────────────────────────────────────────

/**
 * Heart features — chosen for "stylistic identity" rather than
 * "anatomy detection." Each captures a dimension along which different
 * people draw their hearts differently. Doesn't require detecting
 * cusps/lobes specifically.
 *
 *   - aspectRatio:           overall shape proportions
 *   - verticalCenterRatio:   where ink mass sits vertically
 *   - topHalfPeakCount:      how many "lobe peaks" the user produces
 *   - bottomPointSharpness:  pointy bottom vs rounded
 */
function extractHeartFeatures(points: StrokePoint[]): HeartFeatures {
  const bbox = boundingBox(points);
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  const aspectRatio = height > 0 ? width / height : 1;

  // Where does the ink "weight" sit vertically? Bigger top lobes pull the
  // centroid lower in the bbox (note: in canvas coords, larger Y = lower).
  const c = centroid(points);
  const verticalCenterRatio = height > 0 ? (c.y - bbox.minY) / height : 0.5;

  // Count local maxima in Y in the TOP HALF of the bbox. Standard hearts have
  // 2 (the two lobe peaks); some people draw with 1 fluid sweep producing 1.
  // Per-user consistency on this count is the signal.
  // (Canvas Y grows downward, so "top" = small Y. "Peak" in the top half
  // means a local MIN in y-coordinates.)
  const topHalfThreshold = bbox.minY + height * 0.5;
  const topPoints = points.filter(p => p.y < topHalfThreshold);
  let topHalfPeakCount = 0;
  // A peak is a point where Y is locally minimal among its neighbors within
  // the top half. Use a small window to suppress micro-jitter.
  const window = Math.max(2, Math.floor(topPoints.length / 30));
  for (let i = window; i < topPoints.length - window; i++) {
    let isMin = true;
    for (let j = 1; j <= window; j++) {
      if (topPoints[i].y >= topPoints[i - j].y || topPoints[i].y >= topPoints[i + j].y) {
        isMin = false;
        break;
      }
    }
    if (isMin) topHalfPeakCount++;
  }

  // Sharpness at the bottom-most point (the heart's point). 3-point curvature
  // around the lowest-Y point. Pointy heart → high curvature; rounded → low.
  let bottomPointSharpness = 0;
  if (points.length >= 3) {
    let bottomIdx = 0;
    let bottomY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      if (points[i].y > bottomY) { // canvas-down = bigger Y
        bottomY = points[i].y;
        bottomIdx = i;
      }
    }
    // Pick neighbors a few steps away to avoid jitter at the exact tip.
    const offset = Math.max(1, Math.floor(points.length / 40));
    const a = points[Math.max(0, bottomIdx - offset)];
    const b = points[bottomIdx];
    const c2 = points[Math.min(points.length - 1, bottomIdx + offset)];
    bottomPointSharpness = curvature(a, b, c2);
  }

  return { aspectRatio, verticalCenterRatio, topHalfPeakCount, bottomPointSharpness };
}

// ─── Defaults ────────────────────────────────────────────────────────────────

function getDefaultFeatures(shapeType: ChallengeItemType): ShapeSpecificFeatures {
  switch (shapeType) {
    case 'circle':
      return { startPositionAnalysis: 0, closureTechnique: 0, curveConsistency: 0, radialDeviation: 1 };
    case 'square':
      return { cornerExecution: 0, lineStraightness: 0, cornerPressureSpikes: 1, edgeLengthConsistency: 0 };
    case 'triangle':
      return { angleConsistency: 0, vertexPressure: 1, sideLengthRatios: 1, apexSharpness: 0 };
    case 'house':
      return { roofToBaseRatio: 0.5, symmetryScore: 0.5, connectionTechnique: 0.5, lineStability: 0 };
    case 'smiley':
      return { featurePlacement: 0.5, strokeSequencing: 0, facialSymmetry: 0.5, componentProportions: 0 };
    case 'heart':
      return { aspectRatio: 1, verticalCenterRatio: 0.5, topHalfPeakCount: 0, bottomPointSharpness: 0 };
  }
}
