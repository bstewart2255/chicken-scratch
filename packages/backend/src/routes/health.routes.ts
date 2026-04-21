import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Sentry round-trip smoke test. Triggers a status-less thrown error that
 * Sentry's express error handler will capture. Gated by the
 * `X-Sentry-Debug` header to prevent abuse or accidental hits — any request
 * without the header just gets a 404, so the route is effectively invisible.
 * Uses ADMIN_API_KEY as the shared secret so only operators can fire it.
 * Leave in place: useful for verifying Sentry is working after
 * instrumentation changes.
 */
router.get('/api/debug/trigger-sentry-error', (req, res, next) => {
  const header = req.header('x-sentry-debug');
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || header !== adminKey) {
    res.status(404).send('Not found');
    return;
  }
  next(new Error('Deliberate Sentry round-trip test — safe to ignore. If you see this in your dashboard, error capture is working.'));
});

export default router;
