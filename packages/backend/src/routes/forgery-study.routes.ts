import { Router } from 'express';
import type {
  DeviceClass,
  ForgeryStudyResults,
  ForgeryStudyTargetUser,
  ForgeryItemType,
} from '@chicken-scratch/shared';
import { requireAdminKey } from '../middleware/admin-auth.js';
import * as service from '../services/forgery-study.service.js';
import * as repo from '../db/repositories/forgery-study.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';

const router = Router();

function isDeviceClass(v: unknown): v is DeviceClass {
  return v === 'mobile' || v === 'desktop';
}

// Tenant (t:...) and demo (demo-...) users are customer/ephemeral accounts
// and must never be forgery targets — keep them out of the picker entirely.
function isEligibleTarget(username: string): boolean {
  return !username.startsWith('t:') && !username.startsWith('demo-');
}

// ─── Admin: research-target management ──────────────────────────────────────

router.get('/api/forgery-study/users', requireAdminKey, async (_req, res, next) => {
  try {
    const users = await userRepo.listUsers();
    const result: ForgeryStudyTargetUser[] = users
      .filter(u => isEligibleTarget(u.username))
      .map(u => ({
        username: u.username,
        enrolled: !!u.enrolled,
        researchTarget: !!u.research_target,
      }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/api/forgery-study/users/:username/research-target', requireAdminKey, async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (!isEligibleTarget(user.username)) {
      res.status(403).json({ error: 'Tenant and demo users cannot be research targets.' });
      return;
    }
    const enabled = Boolean(req.body?.enabled);
    await userRepo.setResearchTarget(user.id, enabled);
    res.json({ success: true, username: user.username, researchTarget: enabled });
  } catch (err) {
    next(err);
  }
});

// ─── Admin: studies ─────────────────────────────────────────────────────────

router.post('/api/forgery-study', requireAdminKey, async (req, res, next) => {
  try {
    const { targetUsername, forgerLabel, deviceClass, notes } = req.body ?? {};
    if (!targetUsername || typeof targetUsername !== 'string') {
      res.status(400).json({ error: 'targetUsername is required.' });
      return;
    }
    if (!forgerLabel || typeof forgerLabel !== 'string') {
      res.status(400).json({ error: 'forgerLabel is required.' });
      return;
    }
    if (!isDeviceClass(deviceClass)) {
      res.status(400).json({ error: "deviceClass must be 'mobile' or 'desktop'." });
      return;
    }

    const result = await service.createStudy(
      targetUsername,
      forgerLabel,
      deviceClass,
      typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    );
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }

    const url = `${req.protocol}://${req.get('host')}/forge/${result.studyId}`;
    res.json({ studyId: result.studyId, url, forgerLabel: result.forgerLabel });
  } catch (err) {
    next(err);
  }
});

router.get('/api/forgery-study', requireAdminKey, async (_req, res, next) => {
  try {
    res.json(await repo.listStudies());
  } catch (err) {
    next(err);
  }
});

router.get('/api/forgery-study/:id/results', requireAdminKey, async (req, res, next) => {
  try {
    const summary = await repo.getStudySummary(req.params.id);
    if (!summary) {
      res.status(404).json({ error: 'Study not found.' });
      return;
    }
    const attempts = await repo.getAttempts(req.params.id);
    const result: ForgeryStudyResults = {
      study: summary,
      attempts: attempts.map(a => ({
        attemptIndex: a.attemptIndex,
        combinedScore: a.combinedScore,
        threshold: a.threshold,
        passed: a.passed,
        createdAt: a.createdAt,
        itemScores: a.itemScores.map(i => ({ itemType: i.itemType as ForgeryItemType, score: i.score })),
      })),
    };
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Open (by unguessable study UUID): forger flow ──────────────────────────

router.get('/api/forgery-study/:id', async (req, res, next) => {
  try {
    const view = await service.getStudyView(req.params.id);
    if (!view) {
      res.status(404).json({ error: 'Study not found.' });
      return;
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});

router.post('/api/forgery-study/:id/attempt', async (req, res, next) => {
  try {
    const { signatureData, shapes } = req.body ?? {};
    if (!signatureData || typeof signatureData !== 'object' || !Array.isArray(shapes)) {
      res.status(400).json({ error: 'signatureData and shapes are required.' });
      return;
    }

    const result = await service.submitAttempt(req.params.id, { signatureData, shapes });
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    // Pass/fail only — never the numeric score.
    res.json({ attemptIndex: result.attemptIndex, passed: result.passed });
  } catch (err) {
    next(err);
  }
});

export default router;
