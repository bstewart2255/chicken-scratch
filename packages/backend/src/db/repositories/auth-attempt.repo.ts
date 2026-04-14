import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
import type { FeatureComparison, DeviceCapabilities, AllFeatures, ShapeScoreBreakdown } from '@chicken-scratch/shared';
import type { ShapeAttemptDetail } from '@chicken-scratch/shared';

export interface AuthAttemptRow {
  id: string;
  user_id: string;
  score: number;
  threshold: number;
  authenticated: boolean;
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
  is_forgery: boolean;
  created_at: string;
}

export async function createAttempt(
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
): Promise<AuthAttemptRow> {
  const id = uuid();
  const result = await query<AuthAttemptRow>(`
    INSERT INTO auth_attempts (id, user_id, score, threshold, authenticated, breakdown, device_capabilities,
      attempt_type, signature_features, signature_comparison, shape_scores, shape_details, fingerprint_match,
      duration_ms, step_durations)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `, [
    id,
    userId,
    score,
    threshold,
    authenticated,
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
  ]);
  return result.rows[0];
}

export async function getRecentAttempts(userId: string, limit = 10): Promise<AuthAttemptRow[]> {
  const result = await query<AuthAttemptRow>(
    'SELECT * FROM auth_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return result.rows;
}

export async function getAllAttempts(userId: string): Promise<AuthAttemptRow[]> {
  const result = await query<AuthAttemptRow>(
    'SELECT * FROM auth_attempts WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows;
}

export async function getAttemptById(attemptId: string): Promise<AuthAttemptRow | undefined> {
  const result = await query<AuthAttemptRow>(
    'SELECT * FROM auth_attempts WHERE id = $1',
    [attemptId],
  );
  return result.rows[0];
}

export async function setForgeryFlag(attemptId: string, isForgery: boolean): Promise<void> {
  await query('UPDATE auth_attempts SET is_forgery = $1 WHERE id = $2', [isForgery, attemptId]);
}

export async function getAttemptStats(userId: string): Promise<{
  count: number;
  meanScore: number;
  stdDev: number;
  minScore: number;
  maxScore: number;
  passCount: number;
  failCount: number;
}> {
  const result = await query<{
    count: string;
    meanscore: number;
    minscore: number;
    maxscore: number;
    passcount: string;
    failcount: string;
  }>(`
    SELECT
      COUNT(*) as count,
      COALESCE(AVG(score), 0) as meanScore,
      COALESCE(MIN(score), 0) as minScore,
      COALESCE(MAX(score), 0) as maxScore,
      SUM(CASE WHEN authenticated = TRUE THEN 1 ELSE 0 END) as passCount,
      SUM(CASE WHEN authenticated = FALSE THEN 1 ELSE 0 END) as failCount
    FROM auth_attempts WHERE user_id = $1
  `, [userId]);

  const row = result.rows[0];
  const count = parseInt(row.count, 10);
  const meanScore = row.meanscore ?? 0;

  // Compute stddev using Postgres built-in
  let stdDev = 0;
  if (count > 1) {
    const stdResult = await query<{ stddev: number }>(
      'SELECT STDDEV(score) as stddev FROM auth_attempts WHERE user_id = $1',
      [userId],
    );
    stdDev = stdResult.rows[0]?.stddev ?? 0;
  }

  return {
    count,
    meanScore: Math.round(meanScore * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    minScore: Math.round((row.minscore ?? 0) * 100) / 100,
    maxScore: Math.round((row.maxscore ?? 0) * 100) / 100,
    passCount: parseInt(row.passcount as string, 10) || 0,
    failCount: parseInt(row.failcount as string, 10) || 0,
  };
}
