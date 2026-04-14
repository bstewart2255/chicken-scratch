import { Router } from 'express';
import * as tenantRepo from '../db/repositories/tenant.repo.js';
import * as consentRepo from '../db/repositories/consent.repo.js';

const router = Router();

// Create a new tenant — returns the API key (only shown once)
router.post('/api/admin/tenants', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Tenant name is required.' });
      return;
    }

    const tenant = await tenantRepo.createTenant(name.trim());

    res.status(201).json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        apiKey: tenant.api_key, // Only returned on creation
        createdAt: tenant.created_at,
      },
      message: 'Tenant created. Save the API key — it will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

// List all tenants (API keys masked)
router.get('/api/admin/tenants', async (_req, res, next) => {
  try {
    const tenants = await tenantRepo.listTenants();
    const result = await Promise.all(tenants.map(async t => ({
      id: t.id,
      name: t.name,
      apiKeyPrefix: t.api_key.substring(0, 10) + '...',
      active: !!t.active,
      userCount: await tenantRepo.getTenantUserCount(t.id),
      createdAt: t.created_at,
    })));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get single tenant details
router.get('/api/admin/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    const users = await tenantRepo.listTenantUsers(tenant.id);

    res.json({
      id: tenant.id,
      name: tenant.name,
      apiKeyPrefix: tenant.api_key.substring(0, 10) + '...',
      active: !!tenant.active,
      createdAt: tenant.created_at,
      users: users.map(u => ({
        externalUserId: u.external_user_id,
        internalUserId: u.user_id,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Rotate API key — returns new key (old key immediately invalid)
router.post('/api/admin/tenants/:id/rotate-key', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    const newKey = await tenantRepo.rotateApiKey(tenant.id);
    res.json({
      success: true,
      apiKey: newKey,
      message: 'API key rotated. Save the new key — it will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

// List consent records for a tenant
router.get('/api/admin/tenants/:id/consents', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    const consents = await consentRepo.listTenantConsents(tenant.id);
    res.json(consents.map(c => ({
      id: c.id,
      externalUserId: c.external_user_id,
      policyVersion: c.policy_version,
      consentedAt: c.consented_at,
      withdrawnAt: c.withdrawn_at,
      active: c.withdrawn_at === null,
    })));
  } catch (err) {
    next(err);
  }
});

// Deactivate tenant (soft delete — all API calls will fail)
router.post('/api/admin/tenants/:id/deactivate', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    await tenantRepo.deactivateTenant(tenant.id);
    res.json({ success: true, message: 'Tenant deactivated.' });
  } catch (err) {
    next(err);
  }
});

export default router;
