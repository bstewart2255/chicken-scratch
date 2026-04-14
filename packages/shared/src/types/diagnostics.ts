import type { AllFeatures, FeatureComparison } from './features.js';
import type { ShapeScoreBreakdown, ChallengeItemType, ShapeSpecificFeatures } from './shape.js';
import type { DeviceCapabilities } from './stroke.js';

export interface FingerprintSignalInfo {
  name: string;
  enrolled: string;
  current: string;
  match: boolean;
  weight: number;
}

export interface FingerprintMatchResult {
  score: number;
  sameDevice: boolean;
  signals: FingerprintSignalInfo[];
}

export interface StepDuration {
  step: string;        // 'signature-1', 'signature-2', 'circle', 'house', etc.
  durationMs: number;
}

export interface DiagnosticsAttempt {
  id: string;
  userId: string;
  attemptType: 'signature' | 'full';
  score: number;
  threshold: number;
  authenticated: boolean;
  breakdown: FeatureComparison;
  signatureFeatures: AllFeatures | null;
  signatureComparison: FeatureComparison | null;
  shapeScores: ShapeScoreBreakdown[] | null;
  shapeDetails: ShapeAttemptDetail[] | null;
  deviceCapabilities: DeviceCapabilities;
  fingerprintMatch: FingerprintMatchResult | null;
  durationMs: number | null;
  stepDurations: StepDuration[] | null;
  isForgery: boolean;
  createdAt: string;
}

export interface ShapeAttemptDetail {
  shapeType: ChallengeItemType;
  attemptBiometricFeatures: AllFeatures;
  attemptShapeFeatures: ShapeSpecificFeatures | null; // null for drawings (biometric-only)
  biometricComparison: FeatureComparison;
  shapeFeatureScore: number; // 0 for drawings
}

export interface UserStats {
  totalAttempts: number;
  passCount: number;
  failCount: number;
  meanScore: number;
  stdDev: number;
  minScore: number;
  maxScore: number;
  scoreDistribution: { bucket: string; count: number }[];
}

export interface DiagnosticsUser {
  id: string;
  username: string;
  enrolled: boolean;
  createdAt: string;
}

export interface BaselineSummary {
  signature: {
    avgFeatures: AllFeatures;
    featureStdDevs: Record<string, number>;
    hasPressureData: boolean;
  } | null;
  shapes: {
    shapeType: ChallengeItemType;
    avgBiometricFeatures: AllFeatures;
    avgShapeFeatures: ShapeSpecificFeatures | null;
  }[];
}

// Forgery simulation types
export type ForgeryLevel = 'random' | 'unskilled' | 'skilled' | 'replay';

export interface ForgeryTrialResult {
  score: number;
  authenticated: boolean;
  signatureScore: number;
  avgShapeScore: number;
  shapeScores: { shapeType: ChallengeItemType; combinedScore: number }[];
}

export interface ForgeryLevelResult {
  level: ForgeryLevel;
  label: string;
  description: string;
  trials: number;
  scores: number[];
  meanScore: number;
  stdDev: number;
  minScore: number;
  maxScore: number;
  passCount: number;
  falseAcceptanceRate: number; // 0-1
  trialDetails: ForgeryTrialResult[];
}

export interface ForgerySimulationResult {
  username: string;
  threshold: number;
  realUserMeanScore: number;
  runAt: string;
  trialsPerLevel: number;
  levels: ForgeryLevelResult[];
}
