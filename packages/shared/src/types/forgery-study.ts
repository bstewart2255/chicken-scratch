import type { DeviceClass } from './auth.js';
import type { ChallengeItemType, ShapeData } from './shape.js';
import type { RawSignatureData } from './stroke.js';

/**
 * A study item is the target's signature or one shape. The forger copies
 * each one. `signature` is always first, then the shapes the target has
 * baselines for.
 */
export type ForgeryItemType = 'signature' | ChallengeItemType;

/**
 * Coordinate-only polylines for the static reference image. Timing and
 * pressure are deliberately stripped server-side: the v1 study measures
 * copy-from-a-still-picture, and shipping the raw timed stroke data would
 * hand the forger the dynamics the biometric actually relies on.
 */
export interface ReferencePolylines {
  strokes: { x: number; y: number }[][];
  canvasSize: { width: number; height: number };
}

export interface ForgeryStudyItem {
  itemType: ForgeryItemType;
  reference: ReferencePolylines;
}

/** Forger-facing study payload — GET /api/forgery-study/:id. */
export interface ForgeryStudyView {
  studyId: string;
  forgerLabel: string;
  deviceClass: DeviceClass;
  items: ForgeryStudyItem[];
}

/** Forger attempt submission — POST /api/forgery-study/:id/attempt. */
export interface ForgeryAttemptSubmission {
  signatureData: RawSignatureData;
  shapes: ShapeData[];
}

/** Attempt response — pass/fail only. A numeric score is never returned. */
export interface ForgeryAttemptResult {
  attemptIndex: number;
  passed: boolean;
}

/** Admin-facing study summary — GET /api/forgery-study. */
export interface ForgeryStudySummary {
  id: string;
  targetUsername: string;
  forgerLabel: string;
  deviceClass: DeviceClass;
  notes: string | null;
  createdAt: string;
  attemptCount: number;
  passCount: number;
  lastAttemptAt: string | null;
}

/** One attempt in the learning curve — admin-facing. */
export interface ForgeryStudyAttemptDetail {
  attemptIndex: number;
  combinedScore: number;
  threshold: number;
  passed: boolean;
  createdAt: string;
  itemScores: { itemType: ForgeryItemType; score: number }[];
}

export interface ForgeryStudyResults {
  study: ForgeryStudySummary;
  attempts: ForgeryStudyAttemptDetail[];
}

export interface ForgeryStudyCreateRequest {
  targetUsername: string;
  forgerLabel: string;
  deviceClass: DeviceClass;
  notes?: string;
}

export interface ForgeryStudyCreateResponse {
  studyId: string;
  url: string;
  forgerLabel: string;
}

/** A candidate target for the admin study-creation form. */
export interface ForgeryStudyTargetUser {
  username: string;
  enrolled: boolean;
  researchTarget: boolean;
}
