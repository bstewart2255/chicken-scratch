import type { Request, Response, NextFunction } from 'express';
import { verifySdkToken } from '../services/sdk-token.service.js';
import * as tenantRepo from '../db/repositories/tenant.repo.js';

/**
 * Middleware that accepts an SDK token (JWT) via Authorization: Bearer header.
 * Used for browser-side SDK requests where the raw API key shouldn't be exposed.
 *
 * The token is scoped to a tenant + externalUserId. This middleware:
 * 1. Validates the JWT signature and expiry
 * 2. Looks up the tenant to confirm it's active
 * 3. Attaches tenant + externalUserId to the request
 *
 * This middleware is an ALTERNATIVE to requireApiKey — the tenant-api routes
 * check for SDK tokens first, then fall back to API key auth.
 */
export function sdkTokenAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer cs_sdk_')) {
    // Not an SDK token — skip to next middleware (API key auth will handle it)
    next();
    return;
  }

  // Strip "Bearer cs_sdk_" prefix to get the raw JWT
  const token = authHeader.slice('Bearer cs_sdk_'.length);
  const payload = verifySdkToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired SDK token. Request a new one from your backend.',
    });
    return;
  }

  tenantRepo.findById(payload.tenantId)
    .then(tenant => {
      if (!tenant || !tenant.active) {
        res.status(403).json({
          success: false,
          error: 'Tenant is inactive.',
        });
        return;
      }

      req.tenant = tenant;
      (req as any).sdkExternalUserId = payload.externalUserId;
      next();
    })
    .catch(next);
}
