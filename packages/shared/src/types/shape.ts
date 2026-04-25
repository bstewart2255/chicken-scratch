import type { RawSignatureData } from './stroke.js';

/**
 * `ShapeType` retains 'triangle' even though it's been removed from the
 * default challenge set (SHAPE_TYPES below) — historical baselines stored
 * before the 2026-04 swap may still carry triangle data, and we want
 * those rows to typecheck if anyone reads them. New enrollments will not
 * include triangle.
 */
export type ShapeType = 'circle' | 'square' | 'triangle';
export type DrawingType = 'house' | 'smiley' | 'heart';
export type ChallengeItemType = ShapeType | DrawingType;

/**
 * The active challenge set used to build new enrollment + verify sessions.
 * Triangle was dropped 2026-04 because forgery analysis showed it carried
 * weak per-user identity (forgers scoring 85+ on it consistently — a
 * triangle is a triangle). Heart was added in its place: drawings carry
 * stronger per-user stylistic signal than simple geometric shapes.
 */
export const SHAPE_TYPES: ShapeType[] = ['circle', 'square'];
export const DRAWING_TYPES: DrawingType[] = ['house', 'smiley', 'heart'];
export const ALL_CHALLENGE_TYPES: ChallengeItemType[] = [...SHAPE_TYPES, ...DRAWING_TYPES];

/** Check if a challenge item is a drawing type */
export function isDrawingType(type: string): type is DrawingType {
  return type === 'house' || type === 'smiley' || type === 'heart';
}

// Shape-specific features (4 per shape type)
export interface CircleFeatures {
  startPositionAnalysis: number;  // where on the circle drawing starts (0-1)
  closureTechnique: number;       // how well the shape closes (0-1)
  curveConsistency: number;       // avg angle variation between segments
  radialDeviation: number;        // stddev(radii) / avgRadius
}

export interface SquareFeatures {
  cornerExecution: number;        // 1/(1 + stddev(corner angles))
  lineStraightness: number;       // avg point-to-line deviation per edge
  cornerPressureSpikes: number;   // avg pressure ratio at corners
  edgeLengthConsistency: number;  // 1/(1 + stddev/avg of edge lengths)
}

export interface TriangleFeatures {
  angleConsistency: number;       // 1/(1 + |angleSum - PI| * 10)
  vertexPressure: number;         // pressure pattern at vertices
  sideLengthRatios: number;       // ratio pattern of sorted side lengths
  apexSharpness: number;          // avg curvature at detected corners
}

export interface HouseFeatures {
  roofToBaseRatio: number;        // height of roof portion / height of base portion
  symmetryScore: number;          // left-right symmetry (0-1, 1 = perfectly symmetric)
  connectionTechnique: number;    // how roof meets walls (gap/overlap quality 0-1)
  lineStability: number;          // avg straightness of wall/edge segments
}

export interface SmileyFeatures {
  featurePlacement: number;       // normalized centroid of internal features vs face center
  strokeSequencing: number;       // encoded draw order of components (face, eyes, mouth)
  facialSymmetry: number;         // left-right symmetry of internal features (0-1)
  componentProportions: number;   // ratio of feature sizes to face diameter
}

/**
 * Heart features — chosen for "stylistic identity" rather than "anatomy
 * detection." Each captures a dimension along which different people
 * draw their hearts differently, without needing the extractor to
 * detect cusps or lobes per se.
 */
export interface HeartFeatures {
  aspectRatio: number;            // bbox width / bbox height. Tall narrow vs short squat heart.
  verticalCenterRatio: number;    // (centroid_y − minY) / bbox_height. Where the ink mass sits vertically — bigger top lobes pull it down.
  topHalfPeakCount: number;       // number of local-maxima-in-Y in the top half. ~2 for canonical hearts; user may consistently produce more or fewer.
  bottomPointSharpness: number;   // 3-point curvature at the lowest-Y point. Pointy bottom vs rounded.
}

export type ShapeSpecificFeatures =
  | CircleFeatures | SquareFeatures | TriangleFeatures
  | HouseFeatures | SmileyFeatures | HeartFeatures;

export interface ShapeEnrollmentRequest {
  username: string;
  shapeType: ChallengeItemType;
  signatureData: RawSignatureData; // reuse same stroke format
}

export interface ShapeData {
  shapeType: ChallengeItemType;
  signatureData: RawSignatureData;
}

export interface FullVerifyRequest {
  username: string;
  signatureData: RawSignatureData;
  shapes: ShapeData[];
  challengeId: string; // server-issued challenge — validates shape order
  durationMs?: number; // total verification time in ms
  stepDurations?: { step: string; durationMs: number }[]; // per-step timings
}

export interface ShapeScoreBreakdown {
  shapeType: ChallengeItemType;
  biometricScore: number;  // 0-100 from pressure/timing/geometric/security
  shapeScore: number;      // 0-100 from shape-specific features (0 for drawings)
  combinedScore: number;   // biometric 70% + shape 30% (or 100% biometric for drawings)
}

export interface FullVerifyResponse {
  success: boolean;
  authenticated: boolean;
  finalScore: number;       // signature 60% + shapes 40%
  threshold: number;
  signatureScore: number;
  shapeScores: ShapeScoreBreakdown[];
  message: string;
  // Machine-readable error code when success=false. Customers key UX off this.
  // DEVICE_CLASS_MISMATCH → user is on a class they haven't enrolled; client
  // should offer "switch device" or "add this device" (see enrolledClasses).
  errorCode?: 'DEVICE_CLASS_MISMATCH';
  // Classes the user already has baselines for. Present with DEVICE_CLASS_MISMATCH
  // so clients can tell the user which device(s) they can verify on.
  enrolledClasses?: string[];
  // The device class detected from the submitted strokes. Useful context even
  // when verification passes.
  deviceClass?: string;
}
