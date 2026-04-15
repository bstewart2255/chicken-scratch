import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that requires a valid admin key in the X-Admin-Key header.
 * Set ADMIN_API_KEY in environment variables — if unset, admin routes are
 * disabled entirely (returns 503) to prevent accidental open access.
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

  const provided = req.headers['x-admin-key'] as string | undefined;

  if (!provided) {
    res.status(401).json({
      success: false,
      error: 'Missing admin key. Include X-Admin-Key header.',
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(adminKey);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !require('crypto').timingSafeEqual(expected, actual)) {
    res.status(401).json({
      success: false,
      error: 'Invalid admin key.',
    });
    return;
  }

  next();
}
