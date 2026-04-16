import { Router } from 'express';
import { CreateSessionRequestSchema } from '@chicken-scratch/shared';
import { validate } from '../middleware/validate.js';
import * as sessionService from '../services/session.service.js';

const router = Router();

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
