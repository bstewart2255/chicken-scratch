import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, cleanTables, teardownTestDb } from './setup.js';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  process.env.ADMIN_API_KEY = 'test-admin-key';
  await setupTestDb();
  app = createApp();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await cleanTables();
});

describe('Admin API', () => {
  const adminHeaders = { 'X-Admin-Key': 'test-admin-key' };
  let tenantId: string;

  describe('GET /api/admin/dashboard', () => {
    it('returns fleet stats', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalTenants');
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('totalVerifications');
      expect(res.body.totalTenants).toBe(0);
    });
  });

  describe('POST /api/admin/tenants', () => {
    it('creates a tenant with hashed API key', async () => {
      const res = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Test Corp', slug: 'test-corp', plan: 'starter' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant.name).toBe('Test Corp');
      expect(res.body.tenant.slug).toBe('test-corp');
      expect(res.body.tenant.plan).toBe('starter');
      expect(res.body.tenant.active).toBe(true);
      // API key returned
      expect(res.body.apiKey.rawKey).toMatch(/^cs_live_/);
      expect(res.body.apiKey.keyPrefix).toMatch(/^cs_live_/);
      tenantId = res.body.tenant.id;
    });

    it('rejects duplicate slug', async () => {
      await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'First', slug: 'dupe-slug' });
      const res = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Second', slug: 'dupe-slug' });
      expect(res.status).toBe(400);
    });

    it('auto-generates slug from name', async () => {
      const res = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'My Cool Company' });
      expect(res.status).toBe(201);
      expect(res.body.tenant.slug).toBe('my-cool-company');
    });

    it('validates name is required', async () => {
      const res = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/tenants', () => {
    it('lists tenants with user counts', async () => {
      await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Org A' });
      await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Org B' });

      const res = await request(app)
        .get('/api/admin/tenants')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('userCount');
    });
  });

  describe('PATCH /api/admin/tenants/:id', () => {
    it('updates tenant fields', async () => {
      const create = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Old Name' });

      const res = await request(app)
        .patch(`/api/admin/tenants/${create.body.tenant.id}`)
        .set(adminHeaders)
        .send({ name: 'New Name', plan: 'enterprise' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
      expect(res.body.plan).toBe('enterprise');
    });
  });

  describe('API Keys', () => {
    it('creates, lists, and revokes API keys', async () => {
      const create = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Key Test Org' });
      const tid = create.body.tenant.id;

      // Create another key
      const keyRes = await request(app)
        .post(`/api/admin/tenants/${tid}/api-keys`)
        .set(adminHeaders)
        .send({ name: 'Production Key' });
      expect(keyRes.status).toBe(201);
      expect(keyRes.body.rawKey).toMatch(/^cs_live_/);
      expect(keyRes.body.name).toBe('Production Key');

      // List keys (should have 2: default + production)
      const listRes = await request(app)
        .get(`/api/admin/tenants/${tid}/api-keys`)
        .set(adminHeaders);
      expect(listRes.body).toHaveLength(2);
      // Raw key should NOT be in list response
      expect(listRes.body[0].rawKey).toBeUndefined();

      // Revoke
      await request(app)
        .delete(`/api/admin/tenants/${tid}/api-keys/${keyRes.body.id}`)
        .set(adminHeaders);

      const afterRevoke = await request(app)
        .get(`/api/admin/tenants/${tid}/api-keys`)
        .set(adminHeaders);
      const revoked = afterRevoke.body.find((k: any) => k.id === keyRes.body.id);
      expect(revoked.status).toBe('revoked');
    });
  });

  describe('Tenant lifecycle', () => {
    it('deactivates and reactivates tenant', async () => {
      const create = await request(app)
        .post('/api/admin/tenants')
        .set(adminHeaders)
        .send({ name: 'Lifecycle Test' });
      const tid = create.body.tenant.id;

      await request(app)
        .post(`/api/admin/tenants/${tid}/deactivate`)
        .set(adminHeaders);
      const detail = await request(app)
        .get(`/api/admin/tenants/${tid}`)
        .set(adminHeaders);
      expect(detail.body.active).toBe(false);

      await request(app)
        .post(`/api/admin/tenants/${tid}/reactivate`)
        .set(adminHeaders);
      const detail2 = await request(app)
        .get(`/api/admin/tenants/${tid}`)
        .set(adminHeaders);
      expect(detail2.body.active).toBe(true);
    });
  });
});
