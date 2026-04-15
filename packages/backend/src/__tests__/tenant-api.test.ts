import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, cleanTables, teardownTestDb } from './setup.js';
import type { Express } from 'express';

let app: Express;
let tenantId: string;
let apiKey: string;

function makeSignatureData() {
  // 25 points — passes the quality gate (minimum 20)
  const points = Array.from({ length: 25 }, (_, i) => ({
    x: 50 + i * 6,
    y: 100 + Math.sin(i * 0.5) * 30,
    pressure: 0.3 + Math.random() * 0.4,
    timestamp: 1000 + i * 20,
  }));
  return {
    strokes: [{
      points,
      startTime: 1000,
      endTime: 1000 + 24 * 20,
    }],
    canvasSize: { width: 400, height: 200 },
    deviceCapabilities: {
      supportsPressure: true,
      supportsTouch: true,
      inputMethod: 'touch' as const,
      browser: 'Chrome',
      os: 'macOS',
    },
    capturedAt: new Date().toISOString(),
  };
}

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
  // Create a tenant and get API key for each test
  const res = await request(app)
    .post('/api/admin/tenants')
    .set('X-Admin-Key', 'test-admin-key')
    .send({ name: 'Test Tenant', slug: 'test-tenant' });
  tenantId = res.body.tenant.id;
  apiKey = res.body.apiKey.rawKey;
});

describe('Tenant API (/api/v1)', () => {
  describe('Authentication', () => {
    it('rejects requests without API key', async () => {
      const res = await request(app)
        .post('/api/v1/enroll')
        .send({ externalUserId: 'user1', signatureData: makeSignatureData() });
      expect(res.status).toBe(401);
    });

    it('rejects invalid API key', async () => {
      const res = await request(app)
        .post('/api/v1/enroll')
        .set('X-API-Key', 'cs_live_invalidkey')
        .send({ externalUserId: 'user1', signatureData: makeSignatureData() });
      expect(res.status).toBe(401);
    });

    it('accepts key via X-API-Key header', async () => {
      const res = await request(app)
        .get('/api/v1/enroll/someuser/status')
        .set('X-API-Key', apiKey);
      expect(res.status).toBe(200);
    });

    it('accepts key via Authorization Bearer', async () => {
      const res = await request(app)
        .get('/api/v1/enroll/someuser/status')
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(200);
    });

    it('rejects revoked keys', async () => {
      // Revoke the key via admin
      const keys = await request(app)
        .get(`/api/admin/tenants/${tenantId}/api-keys`)
        .set('X-Admin-Key', 'test-admin-key');
      const keyId = keys.body.find((k: any) => k.status === 'active')?.id;
      await request(app)
        .delete(`/api/admin/tenants/${tenantId}/api-keys/${keyId}`)
        .set('X-Admin-Key', 'test-admin-key');

      const res = await request(app)
        .get('/api/v1/enroll/someuser/status')
        .set('X-API-Key', apiKey);
      expect(res.status).toBe(401);
    });

    it('rejects inactive tenant', async () => {
      await request(app)
        .post(`/api/admin/tenants/${tenantId}/deactivate`)
        .set('X-Admin-Key', 'test-admin-key');

      const res = await request(app)
        .get('/api/v1/enroll/someuser/status')
        .set('X-API-Key', apiKey);
      expect(res.status).toBe(403);
    });
  });

  describe('Consent flow', () => {
    it('requires consent before enrollment', async () => {
      const res = await request(app)
        .post('/api/v1/enroll')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'user1', signatureData: makeSignatureData() });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/consent/i);
    });

    it('records and checks consent', async () => {
      // Record consent
      const consent = await request(app)
        .post('/api/v1/consent')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'user1' });
      expect(consent.status).toBe(200);
      expect(consent.body.success).toBe(true);

      // Check status
      const status = await request(app)
        .get('/api/v1/consent/user1')
        .set('X-API-Key', apiKey);
      expect(status.body.hasConsented).toBe(true);
    });
  });

  describe('Enrollment flow', () => {
    beforeEach(async () => {
      // Record consent first
      await request(app)
        .post('/api/v1/consent')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'user1' });
    });

    it('enrolls 3 samples and completes', async () => {
      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/api/v1/enroll')
          .set('X-API-Key', apiKey)
          .send({ externalUserId: 'user1', signatureData: makeSignatureData() });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.sampleNumber).toBe(i);
        expect(res.body.samplesRemaining).toBe(3 - i);
        if (i === 3) {
          expect(res.body.enrolled).toBe(true);
        }
      }
    });

    it('rejects low-quality signatures', async () => {
      const badSig = {
        strokes: [{
          points: [
            { x: 10, y: 20, pressure: 0.5, timestamp: 1000 },
            { x: 15, y: 25, pressure: 0.6, timestamp: 1050 },
          ],
          startTime: 1000,
          endTime: 1050,
        }],
        canvasSize: { width: 400, height: 200 },
        deviceCapabilities: {
          supportsPressure: true,
          supportsTouch: true,
          inputMethod: 'touch' as const,
          browser: 'Chrome',
          os: 'macOS',
        },
        capturedAt: new Date().toISOString(),
      };
      const res = await request(app)
        .post('/api/v1/enroll')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'user1', signatureData: badSig });
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/quality/i);
    });

    it('reports enrollment status', async () => {
      const res = await request(app)
        .get('/api/v1/enroll/user1/status')
        .set('X-API-Key', apiKey);
      expect(res.body.enrolled).toBe(false);
      expect(res.body.samplesRequired).toBe(3);
    });
  });

  describe('Verification flow', () => {
    beforeEach(async () => {
      // Consent + enroll 3 samples
      await request(app)
        .post('/api/v1/consent')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'user1' });

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/enroll')
          .set('X-API-Key', apiKey)
          .send({ externalUserId: 'user1', signatureData: makeSignatureData() });
      }
    });

    it('returns pass/fail without exposing scores', async () => {
      // Get challenge
      const challenge = await request(app)
        .post('/api/v1/challenge')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'user1' });
      expect(challenge.status).toBe(200);
      expect(challenge.body.challengeId).toBeDefined();
      expect(challenge.body.shapeOrder).toBeDefined();

      // Verify
      const shapes = challenge.body.shapeOrder.map((shapeType: string) => ({
        shapeType,
        signatureData: makeSignatureData(),
      }));
      const res = await request(app)
        .post('/api/v1/verify')
        .set('X-API-Key', apiKey)
        .send({
          externalUserId: 'user1',
          signatureData: makeSignatureData(),
          shapes,
          challengeId: challenge.body.challengeId,
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('authenticated');
      expect(res.body).toHaveProperty('message');
      // Scores must NOT be exposed
      expect(res.body.score).toBeUndefined();
      expect(res.body.threshold).toBeUndefined();
      expect(res.body.breakdown).toBeUndefined();
    });
  });

  describe('Org isolation', () => {
    let otherApiKey: string;

    beforeEach(async () => {
      // Create second tenant
      const res = await request(app)
        .post('/api/admin/tenants')
        .set('X-Admin-Key', 'test-admin-key')
        .send({ name: 'Other Org', slug: 'other-org' });
      otherApiKey = res.body.apiKey.rawKey;

      // Consent + enroll user in first tenant
      await request(app)
        .post('/api/v1/consent')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'alice' });
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/enroll')
          .set('X-API-Key', apiKey)
          .send({ externalUserId: 'alice', signatureData: makeSignatureData() });
      }
    });

    it('second tenant cannot see first tenant users', async () => {
      const res = await request(app)
        .get('/api/v1/enroll/alice/status')
        .set('X-API-Key', otherApiKey);
      expect(res.body.enrolled).toBe(false);
      expect(res.body.samplesCollected).toBe(0);
    });
  });

  describe('User deletion', () => {
    it('deletes user and all data', async () => {
      // Consent + enroll
      await request(app)
        .post('/api/v1/consent')
        .set('X-API-Key', apiKey)
        .send({ externalUserId: 'deleteme' });
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/enroll')
          .set('X-API-Key', apiKey)
          .send({ externalUserId: 'deleteme', signatureData: makeSignatureData() });
      }

      // Verify enrolled
      const status = await request(app)
        .get('/api/v1/enroll/deleteme/status')
        .set('X-API-Key', apiKey);
      expect(status.body.enrolled).toBe(true);

      // Delete
      const del = await request(app)
        .delete('/api/v1/users/deleteme')
        .set('X-API-Key', apiKey);
      expect(del.body.success).toBe(true);

      // Verify gone
      const after = await request(app)
        .get('/api/v1/enroll/deleteme/status')
        .set('X-API-Key', apiKey);
      expect(after.body.enrolled).toBe(false);
      expect(after.body.samplesCollected).toBe(0);
    });
  });
});
