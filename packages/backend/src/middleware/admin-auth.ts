import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Middleware that requires a valid admin key.
 * Accepts either X-Admin-Key header or Authorization: Bearer header.
 * Set ADMIN_API_KEY in environment variables — if unset, admin routes are
 * disabled entirely (returns 503) to prevent accidental open access.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    res.status(503).json({
      success: false,
      error: 'Admin API is not configured. Set the ADMIN_API_KEY environment variable.',
    });
    return;
  }

  // Accept both X-Admin-Key and Authorization: Bearer
  let provided = req.headers['x-admin-key'] as string | undefined;
  if (!provided) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      provided = authHeader.slice(7);
    }
  }

  if (!provided) {
    res.status(401).json({
      success: false,
      error: 'Missing admin key. Include X-Admin-Key or Authorization: Bearer header.',
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(adminKey);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    res.status(401).json({
      success: false,
      error: 'Invalid admin key.',
    });
    return;
  }

  next();
}
