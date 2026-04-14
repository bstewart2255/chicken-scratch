import { Router } from 'express';
import { CreateSessionRequestSchema } from '@chicken-scratch/shared';
import { validate } from '../middleware/validate.js';
import * as sessionService from '../services/session.service.js';

const router = Router();

router.post('/api/session', validate(CreateSessionRequestSchema), (req, res) => {
  const { username, type } = req.body;
  const result = sessionService.createSession(username, type);
  res.json(result);
});

router.post('/api/challenge', (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'Username required.' });
    return;
  }
  const challenge = sessionService.createChallenge(username);
  res.json(challenge);
});

router.get('/api/session/:id', (req, res) => {
  const session = sessionService.getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired.' });
    return;
  }
  res.json(session);
});

router.patch('/api/session/:id', (req, res) => {
  const { status, result } = req.body;
  const session = sessionService.getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired.' });
    return;
  }

  if (status === 'completed' && result) {
    sessionService.completeSession(req.params.id, result);
  } else if (status) {
    sessionService.updateSessionStatus(req.params.id, status);
  }

  res.json({ success: true });
});

export default router;
