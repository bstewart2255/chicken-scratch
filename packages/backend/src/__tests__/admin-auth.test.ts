import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './setup.js';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Admin auth middleware', () => {
  describe('with ADMIN_API_KEY set', () => {
    beforeEach(() => {
      process.env.ADMIN_API_KEY = 'test-secret-token';
      app = createApp();
    });

    afterEach(() => {
      delete process.env.ADMIN_API_KEY;
    });

    it('rejects requests without auth header', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(401);
    });

    it('rejects requests with wrong token', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('X-Admin-Key', 'wrong-token');
      expect(res.status).toBe(401);
    });

    it('accepts correct token via X-Admin-Key', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('X-Admin-Key', 'test-secret-token');
      expect(res.status).toBe(200);
    });

    it('accepts correct token via Authorization Bearer', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', 'Bearer test-secret-token');
      expect(res.status).toBe(200);
    });

    it('does not affect non-admin routes', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('without ADMIN_API_KEY (disabled)', () => {
    beforeEach(() => {
      delete process.env.ADMIN_API_KEY;
      app = createApp();
    });

    it('returns 503 service unavailable', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not configured/);
    });
  });
});
