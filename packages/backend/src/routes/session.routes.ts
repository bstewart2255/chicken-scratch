import { Router } from 'express';
import { CreateSessionRequestSchema } from '@chicken-scratch/shared';
import { validate } from '../middleware/validate.js';
import * as sessionService from '../services/session.service.js';

const router = Router();

const PATCHABLE_STATUSES = new Set(['pending', 'in_progress', 'completed', 'expired']);

router.post('/api/session', validate(CreateSessionRequestSchema), async (req, res, next) => {
  try {
    const { username, type } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await sessionService.createSession(username, type, baseUrl);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/api/challenge', async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username required.' });
      return;
    }
    const challenge = await sessionService.createChallenge(username);
    res.json(challenge);
  } catch (err) {
    next(err);
  }
});

router.get('/api/session/:id', async (req, res, next) => {
  try {
    const session = await sessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired.' });
      return;
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.patch('/api/session/:id', async (req, res, next) => {
  try {
    const { status, result } = req.body;
    const session = await sessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired.' });
      return;
    }

    if (status !== undefined && !PATCHABLE_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid session status.' });
      return;
    }

    // Verify sessions are completed server-side by the verification
    // endpoint (auth.service.verifyFull writes the authoritative result and
    // mints any attestation token). A client must never be able to mark a
    // verify session 'completed' via PATCH — that would let an
    // unauthenticated caller assert authenticated:true and have the server
    // mint an attestation token for a user who never passed verification.
    if (session.type === 'verify' && status === 'completed') {
      res.status(403).json({ error: 'Verify sessions are completed by the verification endpoint, not via PATCH.' });
      return;
    }

    if (status === 'completed' && result) {
      await sessionService.completeSession(req.params.id, result);
    } else if (status) {
      await sessionService.updateSessionStatus(req.params.id, status);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
