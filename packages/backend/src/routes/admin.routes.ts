import { Router } from 'express';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { adminRateLimit } from '../middleware/rate-limit.js';
import * as tenantRepo from '../db/repositories/tenant.repo.js';
import * as apiKeyRepo from '../db/repositories/api-key.repo.js';
import * as usageRepo from '../db/repositories/usage.repo.js';
import * as consentRepo from '../db/repositories/consent.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';

const router = Router();

// All admin routes require admin key + rate limiting
router.use('/api/admin', adminRateLimit, requireAdminKey);

// ── Dashboard ────────────────────────────────────────────

router.get('/api/admin/dashboard', async (_req, res, next) => {
  try {
    const tenants = await tenantRepo.listTenants();
    const activeTenants = tenants.filter(t => t.active);
    const users = await userRepo.listUsers();
    const enrolledUsers = users.filter(u => u.enrolled);
    const fleetStats = await usageRepo.getFleetStats();

    res.json({
      totalTenants: tenants.length,
      activeTenants: activeTenants.length,
      totalUsers: users.length,
      enrolledUsers: enrolledUsers.length,
      totalVerifications: parseInt(fleetStats.total_verifications, 10),
      verificationsToday: parseInt(fleetStats.verifications_today, 10),
      recentFailureRate: fleetStats.recent_failure_rate,
    });
  } catch (err) {
    next(err);
  }
});

// ── Tenant CRUD ──────────────────────────────────────────

router.post('/api/admin/tenants', async (req, res, next) => {
  try {
    const { name, slug, plan } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Tenant name is required.' });
      return;
    }

    // Auto-generate slug if not provided
    const tenantSlug = slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Check slug uniqueness
    const existing = await tenantRepo.findBySlug(tenantSlug);
    if (existing) {
      res.status(400).json({ success: false, error: `Slug "${tenantSlug}" is already taken.` });
      return;
    }

    const tenant = await tenantRepo.createTenant(name.trim());

    // Set slug and plan
    const updated = await tenantRepo.updateTenant(tenant.id, {
      slug: tenantSlug,
      plan: plan || 'free',
    });

    // Create a default hashed API key
    const { row: apiKey, rawKey } = await apiKeyRepo.createApiKey(tenant.id, 'Default');

    res.status(201).json({
      success: true,
      tenant: {
        id: updated!.id,
        name: updated!.name,
        slug: updated!.slug,
        plan: updated!.plan,
        active: !!updated!.active,
        createdAt: updated!.created_at,
      },
      apiKey: {
        id: apiKey.id,
        keyPrefix: apiKey.key_prefix,
        rawKey, // Only returned on creation
        name: apiKey.name,
      },
      message: 'Tenant created. Save the API key — it will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/admin/tenants', async (_req, res, next) => {
  try {
    const tenants = await tenantRepo.listTenants();
    const result = await Promise.all(tenants.map(async t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      active: !!t.active,
      userCount: await tenantRepo.getTenantUserCount(t.id),
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/api/admin/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    const users = await tenantRepo.listTenantUsers(tenant.id);
    const apiKeys = await apiKeyRepo.listByTenant(tenant.id);
    const consents = await consentRepo.listTenantConsents(tenant.id);

    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      active: !!tenant.active,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
      users: users.map(u => ({
        externalUserId: u.external_user_id,
        internalUserId: u.user_id,
        createdAt: u.created_at,
      })),
      apiKeys: apiKeys.map(k => ({
        id: k.id,
        keyPrefix: k.key_prefix,
        name: k.name,
        status: k.status,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
      })),
      consents: consents.map(c => ({
        id: c.id,
        externalUserId: c.external_user_id,
        policyVersion: c.policy_version,
        consentedAt: c.consented_at,
        active: c.withdrawn_at === null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/api/admin/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    const { name, slug, plan, active } = req.body;
    const updated = await tenantRepo.updateTenant(tenant.id, { name, slug, plan, active });
    res.json({
      id: updated!.id,
      name: updated!.name,
      slug: updated!.slug,
      plan: updated!.plan,
      active: !!updated!.active,
      createdAt: updated!.created_at,
      updatedAt: updated!.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

// ── API Keys ─────────────────────────────────────────────

router.post('/api/admin/tenants/:id/api-keys', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    const name = req.body.name || 'Unnamed Key';
    const { row: apiKey, rawKey } = await apiKeyRepo.createApiKey(tenant.id, name);

    res.status(201).json({
      id: apiKey.id,
      keyPrefix: apiKey.key_prefix,
      rawKey, // Only returned on creation
      name: apiKey.name,
      status: apiKey.status,
      createdAt: apiKey.created_at,
      message: 'API key created. Save the key — it will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/admin/tenants/:id/api-keys', async (req, res, next) => {
  try {
    const keys = await apiKeyRepo.listByTenant(req.params.id);
    res.json(keys.map(k => ({
      id: k.id,
      keyPrefix: k.key_prefix,
      name: k.name,
      status: k.status,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    })));
  } catch (err) {
    next(err);
  }
});

router.delete('/api/admin/tenants/:id/api-keys/:keyId', async (req, res, next) => {
  try {
    await apiKeyRepo.revokeKey(req.params.keyId);
    res.json({ success: true, message: 'API key revoked.' });
  } catch (err) {
    next(err);
  }
});

// ── Usage ────────────────────────────────────────────────

router.get('/api/admin/tenants/:id/usage', async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const usage = await usageRepo.getUsageTimeSeries(req.params.id, days);
    res.json(usage.map(r => ({
      date: r.date,
      enrollments: parseInt(r.enrollments, 10),
      verifications: parseInt(r.verifications, 10),
    })));
  } catch (err) {
    next(err);
  }
});

// ── Consents ─────────────────────────────────────────────

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

// ── Tenant lifecycle ─────────────────────────────────────

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

router.post('/api/admin/tenants/:id/reactivate', async (req, res, next) => {
  try {
    const tenant = await tenantRepo.findById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found.' });
      return;
    }

    await tenantRepo.reactivateTenant(tenant.id);
    res.json({ success: true, message: 'Tenant reactivated.' });
  } catch (err) {
    next(err);
  }
});

// ── User deletion (admin-scoped, by internal username) ──────────────

router.delete('/api/admin/users/:username', async (req, res, next) => {
  try {
    const user = await userRepo.findByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const summary = await userRepo.deleteUser(user.id, user.username);
    res.json({
      success: true,
      username: user.username,
      userId: user.id,
      deletionSummary: summary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
