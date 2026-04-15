import type { Request, Response, NextFunction } from 'express';
import * as apiKeyRepo from '../db/repositories/api-key.repo.js';
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
 * Middleware that requires a valid API key.
 * Accepts either X-API-Key header or Authorization: Bearer header.
 * Looks up the key by SHA-256 hash (keys are never stored in plaintext).
 * Falls back to legacy plaintext lookup for pre-migration keys.
 * Attaches the tenant to req.tenant on success.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  // Accept both X-API-Key and Authorization: Bearer
  let rawKey = req.headers['x-api-key'] as string | undefined;
  if (!rawKey) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      rawKey = authHeader.slice(7);
    }
  }

  if (!rawKey) {
    res.status(401).json({
      success: false,
      error: 'Missing API key. Include X-API-Key or Authorization: Bearer header.',
    });
    return;
  }

  const keyHash = apiKeyRepo.hashKey(rawKey);

  apiKeyRepo.findByKeyHash(keyHash)
    .then(async (apiKey) => {
      if (!apiKey) {
        // Fallback: check legacy plaintext api_key column on tenants table
        // (for keys created before migration 014)
        const legacyTenant = await tenantRepo.findByApiKey(rawKey!);
        if (legacyTenant) {
          req.tenant = legacyTenant;
          next();
          return;
        }

        res.status(401).json({
          success: false,
          error: 'Invalid or revoked API key.',
        });
        return;
      }

      // Touch last_used_at (fire-and-forget)
      apiKeyRepo.touchLastUsed(apiKey.id).catch(() => {});

      const tenant = await tenantRepo.findById(apiKey.tenant_id);
      if (!tenant || !tenant.active) {
        res.status(403).json({
          success: false,
          error: 'Tenant is inactive.',
        });
        return;
      }

      req.tenant = tenant;
      next();
    })
    .catch(next);
}
