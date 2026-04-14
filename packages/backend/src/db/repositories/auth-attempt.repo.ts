import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { FeatureComparison, DeviceCapabilities, AllFeatures, ShapeScoreBreakdown } from '@chicken-scratch/shared';
import type { ShapeAttemptDetail } from '@chicken-scratch/shared';

export interface AuthAttemptRow {
  id: string;
  user_id: string;
  score: number;
  threshold: number;
  authenticated: number;
  breakdown: string;
  device_capabilities: string;
  attempt_type: string;
  signature_features: string | null;
  signature_comparison: string | null;
  shape_scores: string | null;
  shape_details: string | null;
  fingerprint_match: string | null;
  duration_ms: number | null;
  step_durations: string | null;
  is_forgery: number;
  created_at: string;
}

export interface CreateAttemptOptions {
  userId: string;
  score: number;
  threshold: number;
  authenticated: boolean;
  comparison: FeatureComparison;
  deviceCapabilities: DeviceCapabilities;
  attemptType?: 'signature' | 'full';
  signatureFeatures?: AllFeatures;
  signatureComparison?: FeatureComparison;
  shapeScores?: ShapeScoreBreakdown[];
  shapeDetails?: ShapeAttemptDetail[];
}

export function createAttempt(
  userId: string,
  score: number,
  threshold: number,
  authenticated: boolean,
  comparison: FeatureComparison,
  deviceCapabilities: DeviceCapabilities,
  extra?: {
    attemptType?: 'signature' | 'full';
    signatureFeatures?: AllFeatures;
    signatureComparison?: FeatureComparison;
    shapeScores?: ShapeScoreBreakdown[];
    shapeDetails?: ShapeAttemptDetail[];
    fingerprintMatch?: Record<string, unknown>;
    durationMs?: number;
    stepDurations?: { step: string; durationMs: number }[];
  },
): AuthAttemptRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO auth_attempts (id, user_id, score, threshold, authenticated, breakdown, device_capabilities,
      attempt_type, signature_features, signature_comparison, shape_scores, shape_details, fingerprint_match,
      duration_ms, step_durations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    score,
    threshold,
    authenticated ? 1 : 0,
    JSON.stringify(comparison),
    JSON.stringify(deviceCapabilities),
    extra?.attemptType ?? 'signature',
    extra?.signatureFeatures ? JSON.stringify(extra.signatureFeatures) : null,
    extra?.signatureComparison ? JSON.stringify(extra.signatureComparison) : null,
    extra?.shapeScores ? JSON.stringify(extra.shapeScores) : null,
    extra?.shapeDetails ? JSON.stringify(extra.shapeDetails) : null,
    extra?.fingerprintMatch ? JSON.stringify(extra.fingerprintMatch) : null,
    extra?.durationMs ?? null,
    extra?.stepDurations ? JSON.stringify(extra.stepDurations) : null,
  );
  return db.prepare('SELECT * FROM auth_attempts WHERE id = ?').get(id) as AuthAttemptRow;
}

export function getRecentAttempts(userId: string, limit = 10): AuthAttemptRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM auth_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as AuthAttemptRow[];
}

export function getAllAttempts(userId: string): AuthAttemptRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM auth_attempts WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as AuthAttemptRow[];
}

export function getAttemptById(attemptId: string): AuthAttemptRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM auth_attempts WHERE id = ?'
  ).get(attemptId) as AuthAttemptRow | undefined;
}

export function setForgeryFlag(attemptId: string, isForgery: boolean): void {
  const db = getDb();
  db.prepare('UPDATE auth_attempts SET is_forgery = ? WHERE id = ?').run(isForgery ? 1 : 0, attemptId);
}

export function getAttemptStats(userId: string): {
  count: number;
  meanScore: number;
  stdDev: number;
  minScore: number;
  maxScore: number;
  passCount: number;
  failCount: number;
} {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as count,
      COALESCE(AVG(score), 0) as meanScore,
      COALESCE(MIN(score), 0) as minScore,
      COALESCE(MAX(score), 0) as maxScore,
      SUM(CASE WHEN authenticated = 1 THEN 1 ELSE 0 END) as passCount,
      SUM(CASE WHEN authenticated = 0 THEN 1 ELSE 0 END) as failCount
    FROM auth_attempts WHERE user_id = ?
  `).get(userId) as any;

  // Compute stddev (SQLite doesn't have built-in STDDEV)
  let stdDev = 0;
  if (row.count > 1) {
    const scores = db.prepare(
      'SELECT score FROM auth_attempts WHERE user_id = ?'
    ).all(userId) as { score: number }[];
    const mean = row.meanScore;
    const variance = scores.reduce((sum, s) => sum + (s.score - mean) ** 2, 0) / scores.length;
    stdDev = Math.sqrt(variance);
  }

  return {
    count: row.count,
    meanScore: Math.round(row.meanScore * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    minScore: Math.round(row.minScore * 100) / 100,
    maxScore: Math.round(row.maxScore * 100) / 100,
    passCount: row.passCount || 0,
    failCount: row.failCount || 0,
  };
}
