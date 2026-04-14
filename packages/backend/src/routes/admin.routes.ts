import { Router } from 'express';
import * as tenantRepo from '../db/repositories/tenant.repo.js';

const router = Router();

// Create a new tenant — returns the API key (only shown once)
router.post('/api/admin/tenants', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Tenant name is required.' });
    return;
  }

  const tenant = tenantRepo.createTenant(name.trim());

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
});

// List all tenants (API keys masked)
router.get('/api/admin/tenants', (_req, res) => {
  const tenants = tenantRepo.listTenants();
  res.json(tenants.map(t => ({
    id: t.id,
    name: t.name,
    apiKeyPrefix: t.api_key.substring(0, 10) + '...',
    active: t.active === 1,
    userCount: tenantRepo.getTenantUserCount(t.id),
    createdAt: t.created_at,
  })));
});

// Get single tenant details
router.get('/api/admin/tenants/:id', (req, res) => {
  const tenant = tenantRepo.findById(req.params.id);
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found.' });
    return;
  }

  const users = tenantRepo.listTenantUsers(tenant.id);

  res.json({
    id: tenant.id,
    name: tenant.name,
    apiKeyPrefix: tenant.api_key.substring(0, 10) + '...',
    active: tenant.active === 1,
    createdAt: tenant.created_at,
    users: users.map(u => ({
      externalUserId: u.external_user_id,
      internalUserId: u.user_id,
      createdAt: u.created_at,
    })),
  });
});

// Rotate API key — returns new key (old key immediately invalid)
router.post('/api/admin/tenants/:id/rotate-key', (req, res) => {
  const tenant = tenantRepo.findById(req.params.id);
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found.' });
    return;
  }

  const newKey = tenantRepo.rotateApiKey(tenant.id);
  res.json({
    success: true,
    apiKey: newKey,
    message: 'API key rotated. Save the new key — it will not be shown again.',
  });
});

// Deactivate tenant (soft delete — all API calls will fail)
router.post('/api/admin/tenants/:id/deactivate', (req, res) => {
  const tenant = tenantRepo.findById(req.params.id);
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found.' });
    return;
  }

  tenantRepo.deactivateTenant(tenant.id);
  res.json({ success: true, message: 'Tenant deactivated.' });
});

export default router;
