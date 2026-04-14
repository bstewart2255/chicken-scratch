import type { RawSignatureData } from './stroke.js';

export type ShapeType = 'circle' | 'square' | 'triangle';
export type DrawingType = 'house' | 'smiley';
export type ChallengeItemType = ShapeType | DrawingType;

export const SHAPE_TYPES: ShapeType[] = ['circle', 'square', 'triangle'];
export const DRAWING_TYPES: DrawingType[] = ['house', 'smiley'];
export const ALL_CHALLENGE_TYPES: ChallengeItemType[] = [...SHAPE_TYPES, ...DRAWING_TYPES];

/** Check if a challenge item is a drawing type */
export function isDrawingType(type: string): type is DrawingType {
  return type === 'house' || type === 'smiley';
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

export type ShapeSpecificFeatures =
  | CircleFeatures | SquareFeatures | TriangleFeatures
  | HouseFeatures | SmileyFeatures;

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
}
