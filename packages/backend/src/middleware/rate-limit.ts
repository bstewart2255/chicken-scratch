import type { Request, Response, NextFunction } from 'express';
import { THRESHOLDS } from '@chicken-scratch/shared';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory fixed-window rate limiter keyed by tenant ID.
 * Sufficient for a single-instance deployment; swap for Redis if scaling horizontally.
 */
function createRateLimiter(maxRequests: number, windowMs: number) {
  const windows = new Map<string, Window>();

  // Clean up stale entries every 5 minutes to prevent unbounded growth
  setInterval(() => {
    const now = Date.now();
    for (const [key, win] of windows) {
      if (now >= win.resetAt) windows.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Key by tenant ID if authenticated, otherwise by IP
    const key = req.tenant?.id ?? req.ip ?? 'unknown';
    const now = Date.now();

    let win = windows.get(key);
    if (!win || now >= win.resetAt) {
      win = { count: 0, resetAt: now + windowMs };
      windows.set(key, win);
    }

    win.count++;

    const remaining = Math.max(0, maxRequests - win.count);
    const resetSecs = Math.ceil((win.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSecs);

    if (win.count > maxRequests) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please slow down.',
        retryAfterSeconds: resetSecs,
      });
      return;
    }

    next();
  };
}

export const verifyRateLimit = createRateLimiter(
  THRESHOLDS.RATE_VERIFY_MAX,
  THRESHOLDS.RATE_WINDOW_MS,
);

export const enrollRateLimit = createRateLimiter(
  THRESHOLDS.RATE_ENROLL_MAX,
  THRESHOLDS.RATE_WINDOW_MS,
);
