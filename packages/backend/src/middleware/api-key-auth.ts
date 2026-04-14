import type { Request, Response, NextFunction } from 'express';
import * as tenantRepo from '../db/repositories/tenant.repo.js';
import type { TenantRow } from '../db/repositories/tenant.repo.js';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantRow;
    }
  }
}

/**
 * Middleware that requires a valid API key in the X-API-Key header.
 * Attaches the tenant to req.tenant on success.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'Missing API key. Include X-API-Key header.',
    });
    return;
  }

  const tenant = tenantRepo.findByApiKey(apiKey);
  if (!tenant) {
    res.status(401).json({
      success: false,
      error: 'Invalid or inactive API key.',
    });
    return;
  }

  req.tenant = tenant;
  next();
}
