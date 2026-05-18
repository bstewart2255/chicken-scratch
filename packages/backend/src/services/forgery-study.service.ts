import { THRESHOLDS } from '@chicken-scratch/shared';
import type {
  DeviceClass,
  RawSignatureData,
  ChallengeItemType,
  ForgeryStudyView,
  ForgeryStudyItem,
  ReferencePolylines,
  ForgeryAttemptSubmission,
} from '@chicken-scratch/shared';
import { scoreFullAttempt } from './auth.service.js';
import * as repo from '../db/repositories/forgery-study.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sigRepo from '../db/repositories/signature.repo.js';
import * as shapeRepo from '../db/repositories/shape.repo.js';

/**
 * Strip a captured signature down to coordinate-only polylines for the
 * static reference image. Timestamps and pressure are dropped on purpose:
 * the v1 study measures copy-from-a-still-picture, and shipping the timed
 * stroke data would hand the forger the dynamics the biometric relies on.
 */
function toReference(raw: RawSignatureData): ReferencePolylines {
  return {
    strokes: raw.strokes.map(s => s.points.map(p => ({ x: p.x, y: p.y }))),
    canvasSize: raw.canvasSize,
  };
}

export type CreateStudyResult =
  | { ok: true; studyId: string; forgerLabel: string }
  | { ok: false; message: string };

export async function createStudy(
  targetUsername: string,
  forgerLabel: string,
  deviceClass: DeviceClass,
  notes: string | null,
): Promise<CreateStudyResult> {
  const user = await userRepo.findByUsername(targetUsername);
  if (!user) {
    return { ok: false, message: 'Target user not found.' };
  }
  // The scoping wall: a study may only target a user explicitly opted in
  // as a research target. Customer enrollments are structurally ineligible.
  if (!user.research_target) {
    return { ok: false, message: 'Target user is not flagged as a research target.' };
  }
  const baseline = await sigRepo.getBaseline(user.id, deviceClass);
  if (!baseline) {
    return { ok: false, message: `Target has no ${deviceClass} signature baseline to copy.` };
  }
  const study = await repo.createStudy(user.id, forgerLabel, deviceClass, notes);
  return { ok: true, studyId: study.id, forgerLabel: study.forger_label };
}

/** Forger-facing study payload: the items to copy, with reference images. */
export async function getStudyView(studyId: string): Promise<ForgeryStudyView | null> {
  const study = await repo.getStudy(studyId);
  if (!study) return null;

  const sigSamples = await sigRepo.getSamples(study.target_user_id, study.device_class);
  const shapeSamples = await shapeRepo.getShapeSamples(study.target_user_id, study.device_class);

  const items: ForgeryStudyItem[] = [];
  if (sigSamples.length > 0) {
    items.push({
      itemType: 'signature',
      reference: toReference(JSON.parse(sigSamples[0].stroke_data) as RawSignatureData),
    });
  }
  for (const sample of shapeSamples) {
    items.push({
      itemType: sample.shape_type as ChallengeItemType,
      reference: toReference(JSON.parse(sample.stroke_data) as RawSignatureData),
    });
  }

  return {
    studyId: study.id,
    forgerLabel: study.forger_label,
    deviceClass: study.device_class,
    items,
  };
}

export type SubmitAttemptResult =
  | { ok: true; attemptIndex: number; passed: boolean }
  | { ok: false; message: string };

/**
 * Score a forger's attempt on the production scoring path, record it, and
 * return pass/fail only. The numeric score and per-item breakdown are
 * persisted server-side for the researcher but never returned here.
 */
export async function submitAttempt(
  studyId: string,
  submission: ForgeryAttemptSubmission,
): Promise<SubmitAttemptResult> {
  const study = await repo.getStudy(studyId);
  if (!study) return { ok: false, message: 'Study not found.' };

  const targetUser = await userRepo.findById(study.target_user_id);
  if (!targetUser) return { ok: false, message: 'Study target no longer exists.' };

  // Always score against the study's fixed device class, not the forger's
  // detected one — the reference baseline lives on that class.
  const scored = await scoreFullAttempt(
    targetUser,
    submission.signatureData,
    submission.shapes,
    study.device_class,
  );
  if (!scored.ok) return { ok: false, message: scored.message };
  const s = scored.scoring;

  const attemptIndex = await repo.getNextAttemptIndex(studyId);
  const attemptId = await repo.createAttempt(
    studyId,
    attemptIndex,
    s.finalScore,
    THRESHOLDS.AUTH_SCORE_DEFAULT,
    s.authenticated,
  );

  await repo.createAttemptItem(
    attemptId,
    'signature',
    submission.signatureData,
    s.signatureScore,
    s.sigComparison,
  );
  for (const shape of submission.shapes) {
    const score = s.shapeScores.find(x => x.shapeType === shape.shapeType);
    const detail = s.shapeDetails.find(x => x.shapeType === shape.shapeType);
    await repo.createAttemptItem(
      attemptId,
      shape.shapeType,
      shape.signatureData,
      score?.combinedScore ?? 0,
      detail,
    );
  }

  return { ok: true, attemptIndex, passed: s.authenticated };
}
