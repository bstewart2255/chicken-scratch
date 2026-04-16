import { Router } from 'express';
import { enrollSample, enrollShape, getEnrollmentStatus } from '../services/enrollment.service.js';
import { verifyFull } from '../services/auth.service.js';
import { createDemoSession, createDemoVerifySession, getSession, completeSession, cleanupDemoUsers } from '../services/session.service.js';
import * as sessionRepo from '../db/repositories/session.repo.js';

const router = Router();

// ── Demo Session ─────────────────────────────────────────

/** Create a demo enrollment session (no auth required) */
router.post('/api/demo/session', async (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await createDemoSession(baseUrl);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** Create a demo verification session after enrollment */
router.post('/api/demo/verify-session', async (req, res, next) => {
  try {
    const { username, enrollSessionId } = req.body;
    if (!username || !enrollSessionId) {
      res.status(400).json({ error: 'username and enrollSessionId required.' });
      return;
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await createDemoVerifySession(username, enrollSessionId, baseUrl);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Demo Enrollment ──────────────────────────────────────

/** Enroll a signature sample in demo mode */
router.post('/api/demo/enroll', async (req, res, next) => {
  try {
    const { username, signatureData, sessionId } = req.body;
    if (!username || !signatureData) {
      res.status(400).json({ error: 'username and signatureData required.' });
      return;
    }

    // Verify this is a demo session
    if (sessionId) {
      const session = await sessionRepo.getSession(sessionId);
      if (!session?.is_demo) {
        res.status(403).json({ error: 'Not a demo session.' });
        return;
      }
      // Update session status to in_progress
      await sessionRepo.updateSessionStatus(sessionId, 'in_progress');
    }

    const result = await enrollSample(username, signatureData, true);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** Enroll a shape in demo mode */
router.post('/api/demo/enroll/shape', async (req, res, next) => {
  try {
    const { username, shapeType, signatureData } = req.body;
    if (!username || !shapeType || !signatureData) {
      res.status(400).json({ error: 'username, shapeType, and signatureData required.' });
      return;
    }

    const result = await enrollShape(username, shapeType, signatureData, true);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** Check demo enrollment status */
router.get('/api/demo/enroll/:username/status', async (req, res, next) => {
  try {
    const result = await getEnrollmentStatus(req.params.username, true);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Demo Verification ────────────────────────────────────

/** Verify in demo mode (same as /api/verify/full but through demo route) */
router.post('/api/demo/verify', async (req, res, next) => {
  try {
    const { username, signatureData, shapes, challengeId, durationMs, stepDurations } = req.body;
    if (!username || !signatureData || !shapes || !challengeId) {
      res.status(400).json({ error: 'username, signatureData, shapes, and challengeId required.' });
      return;
    }

    const result = await verifyFull(
      username,
      signatureData,
      shapes,
      challengeId,
      (durationMs || stepDurations) ? { durationMs, stepDurations } : undefined,
    );

    res.json({
      success: result.success,
      authenticated: result.authenticated,
      message: result.authenticated
        ? 'Identity verified successfully!'
        : 'Verification failed. Your drawing patterns didn\'t match closely enough.',
    });
  } catch (err) {
    next(err);
  }
});

// ── Demo Cleanup ─────────────────────────────────────────

/** Manual cleanup trigger (also runs automatically on session expiry) */
router.post('/api/demo/cleanup', async (_req, res, next) => {
  try {
    const cleaned = await cleanupDemoUsers();
    res.json({ success: true, cleaned });
  } catch (err) {
    next(err);
  }
});

export default router;
