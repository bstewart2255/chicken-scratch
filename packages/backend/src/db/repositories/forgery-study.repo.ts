import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
import { encryptJson } from '../../utils/crypto.js';
import type { DeviceClass } from '@chicken-scratch/shared';

export interface ForgeryStudyRow {
  id: string;
  target_user_id: string;
  forger_label: string;
  device_class: DeviceClass;
  notes: string | null;
  created_at: string;
}

export interface StudySummary {
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

export interface AttemptWithItems {
  attemptIndex: number;
  combinedScore: number;
  threshold: number;
  passed: boolean;
  createdAt: string;
  itemScores: { itemType: string; score: number }[];
}

export async function createStudy(
  targetUserId: string,
  forgerLabel: string,
  deviceClass: DeviceClass,
  notes: string | null,
): Promise<ForgeryStudyRow> {
  const id = uuid();
  const result = await query<ForgeryStudyRow>(
    `INSERT INTO forgery_studies (id, target_user_id, forger_label, device_class, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, targetUserId, forgerLabel, deviceClass, notes],
  );
  return result.rows[0];
}

export async function getStudy(id: string): Promise<ForgeryStudyRow | undefined> {
  const result = await query<ForgeryStudyRow>('SELECT * FROM forgery_studies WHERE id = $1', [id]);
  return result.rows[0];
}

// Study row + target username + per-study attempt aggregates.
const SUMMARY_SELECT = `
  SELECT s.id, u.username AS target_username, s.forger_label, s.device_class,
         s.notes, s.created_at,
         COALESCE(agg.cnt, 0) AS attempt_count,
         COALESCE(agg.passes, 0) AS pass_count,
         agg.last_at AS last_attempt_at
  FROM forgery_studies s
  JOIN users u ON u.id = s.target_user_id
  LEFT JOIN (
    SELECT study_id, COUNT(*) AS cnt,
           COUNT(*) FILTER (WHERE passed) AS passes,
           MAX(created_at) AS last_at
    FROM forgery_attempts GROUP BY study_id
  ) agg ON agg.study_id = s.id`;

interface SummaryRow {
  id: string;
  target_username: string;
  forger_label: string;
  device_class: DeviceClass;
  notes: string | null;
  created_at: string;
  attempt_count: string;
  pass_count: string;
  last_attempt_at: string | null;
}

function toSummary(r: SummaryRow): StudySummary {
  return {
    id: r.id,
    targetUsername: r.target_username,
    forgerLabel: r.forger_label,
    deviceClass: r.device_class,
    notes: r.notes,
    createdAt: r.created_at,
    attemptCount: Number(r.attempt_count),
    passCount: Number(r.pass_count),
    lastAttemptAt: r.last_attempt_at,
  };
}

export async function listStudies(): Promise<StudySummary[]> {
  const result = await query<SummaryRow>(`${SUMMARY_SELECT} ORDER BY s.created_at DESC`);
  return result.rows.map(toSummary);
}

export async function getStudySummary(id: string): Promise<StudySummary | undefined> {
  const result = await query<SummaryRow>(`${SUMMARY_SELECT} WHERE s.id = $1`, [id]);
  return result.rows[0] ? toSummary(result.rows[0]) : undefined;
}

/** Next 1-based attempt index for a study — the learning-curve x-axis. */
export async function getNextAttemptIndex(studyId: string): Promise<number> {
  const result = await query<{ max: number | null }>(
    'SELECT MAX(attempt_index) AS max FROM forgery_attempts WHERE study_id = $1',
    [studyId],
  );
  return (result.rows[0]?.max ?? 0) + 1;
}

export async function createAttempt(
  studyId: string,
  attemptIndex: number,
  combinedScore: number,
  threshold: number,
  passed: boolean,
): Promise<string> {
  const id = uuid();
  await query(
    `INSERT INTO forgery_attempts (id, study_id, attempt_index, combined_score, threshold, passed)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, studyId, attemptIndex, combinedScore, threshold, passed],
  );
  return id;
}

export async function createAttemptItem(
  attemptId: string,
  itemType: string,
  strokeData: unknown,
  itemScore: number,
  itemBreakdown: unknown,
): Promise<void> {
  const id = uuid();
  await query(
    `INSERT INTO forgery_attempt_items (id, attempt_id, item_type, stroke_data, item_score, item_breakdown)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      attemptId,
      itemType,
      encryptJson(strokeData),
      itemScore,
      itemBreakdown === undefined || itemBreakdown === null ? null : encryptJson(itemBreakdown),
    ],
  );
}

/** All attempts for a study with per-item scores — the learning curve. */
export async function getAttempts(studyId: string): Promise<AttemptWithItems[]> {
  const attempts = await query<{
    id: string;
    attempt_index: number;
    combined_score: number;
    threshold: number;
    passed: boolean;
    created_at: string;
  }>(
    `SELECT id, attempt_index, combined_score, threshold, passed, created_at
     FROM forgery_attempts WHERE study_id = $1 ORDER BY attempt_index`,
    [studyId],
  );
  if (attempts.rows.length === 0) return [];

  const items = await query<{ attempt_id: string; item_type: string; item_score: number }>(
    'SELECT attempt_id, item_type, item_score FROM forgery_attempt_items WHERE attempt_id = ANY($1)',
    [attempts.rows.map(a => a.id)],
  );
  const byAttempt = new Map<string, { itemType: string; score: number }[]>();
  for (const it of items.rows) {
    const arr = byAttempt.get(it.attempt_id) ?? [];
    arr.push({ itemType: it.item_type, score: it.item_score });
    byAttempt.set(it.attempt_id, arr);
  }

  return attempts.rows.map(a => ({
    attemptIndex: a.attempt_index,
    combinedScore: a.combined_score,
    threshold: a.threshold,
    passed: a.passed,
    createdAt: a.created_at,
    itemScores: byAttempt.get(a.id) ?? [],
  }));
}
