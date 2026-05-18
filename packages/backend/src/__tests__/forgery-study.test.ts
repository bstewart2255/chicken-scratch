import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { setupTestDb, cleanTables, teardownTestDb } from './setup.js';
import { query } from '../db/connection.js';

let app: Express;
const ADMIN = 'test-admin-key';

beforeAll(async () => {
  process.env.ADMIN_API_KEY = ADMIN;
  await setupTestDb();
  app = createApp();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  // cleanTables deletes users; forgery_* rows cascade via ON DELETE CASCADE.
  await cleanTables();
});

async function insertUser(
  username: string,
  opts: { enrolled?: boolean; researchTarget?: boolean } = {},
): Promise<string> {
  const id = uuid();
  await query(
    'INSERT INTO users (id, username, enrolled, research_target) VALUES ($1, $2, $3, $4)',
    [id, username, opts.enrolled ?? false, opts.researchTarget ?? false],
  );
  return id;
}

// A 25-point stroke that clears the enrollment quality gates.
function makeSignatureData() {
  const points = Array.from({ length: 25 }, (_, i) => ({
    x: 50 + i * 6,
    y: 100 + Math.sin(i * 0.5) * 30,
    pressure: 0.3 + Math.random() * 0.4,
    timestamp: 1000 + i * 20,
  }));
  return {
    strokes: [{ points, startTime: 1000, endTime: 1000 + 24 * 20 }],
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

describe('Forgery Study API', () => {
  describe('Admin gating', () => {
    it('rejects study creation without an admin key', async () => {
      const res = await request(app).post('/api/forgery-study').send({});
      expect(res.status).toBe(401);
    });

    it('rejects the study list without an admin key', async () => {
      const res = await request(app).get('/api/forgery-study');
      expect(res.status).toBe(401);
    });
  });

  describe('Scoping wall', () => {
    it('refuses to create a study targeting a non-research-target user', async () => {
      await insertUser('alice', { enrolled: true, researchTarget: false });
      const res = await request(app)
        .post('/api/forgery-study')
        .set('X-Admin-Key', ADMIN)
        .send({ targetUsername: 'alice', forgerLabel: 'Mom', deviceClass: 'mobile' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/research target/i);
    });

    it('refuses to create a study for a target with no baseline', async () => {
      await insertUser('blair', { researchTarget: true });
      const res = await request(app)
        .post('/api/forgery-study')
        .set('X-Admin-Key', ADMIN)
        .send({ targetUsername: 'blair', forgerLabel: 'Dad', deviceClass: 'mobile' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/baseline/i);
    });

    it('omits tenant and demo users from the target picker', async () => {
      await insertUser('blair', { researchTarget: true });
      await insertUser('t:tenant1:customer', {});
      await insertUser('demo-abcd1234', {});
      const res = await request(app)
        .get('/api/forgery-study/users')
        .set('X-Admin-Key', ADMIN);
      expect(res.status).toBe(200);
      const names = (res.body as { username: string }[]).map(u => u.username);
      expect(names).toContain('blair');
      expect(names).not.toContain('t:tenant1:customer');
      expect(names).not.toContain('demo-abcd1234');
    });

    it('toggles a user research-target flag', async () => {
      await insertUser('blair', { researchTarget: false });
      const res = await request(app)
        .post('/api/forgery-study/users/blair/research-target')
        .set('X-Admin-Key', ADMIN)
        .send({ enabled: true });
      expect(res.status).toBe(200);
      expect(res.body.researchTarget).toBe(true);
    });
  });

  describe('Forger flow', () => {
    it('returns 404 for an unknown study', async () => {
      const res = await request(app).get(`/api/forgery-study/${uuid()}`);
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-end', () => {
    it('creates a study, serves the forger view, and scores an attempt', async () => {
      // Enroll a plain user with a signature baseline + one shape.
      for (let i = 0; i < 3; i++) {
        const r = await request(app)
          .post('/api/enroll')
          .send({ username: 'blair', signatureData: makeSignatureData() });
        expect(r.status).toBe(200);
      }
      const shape = await request(app)
        .post('/api/enroll/shape')
        .send({ username: 'blair', shapeType: 'circle', signatureData: makeSignatureData() });
      expect(shape.status).toBe(200);

      // Opt blair in as a research target.
      await request(app)
        .post('/api/forgery-study/users/blair/research-target')
        .set('X-Admin-Key', ADMIN)
        .send({ enabled: true });

      // Create a study.
      const created = await request(app)
        .post('/api/forgery-study')
        .set('X-Admin-Key', ADMIN)
        .send({ targetUsername: 'blair', forgerLabel: 'Mom', deviceClass: 'mobile' });
      expect(created.status).toBe(200);
      const studyId = created.body.studyId as string;
      expect(created.body.url).toContain(`/forge/${studyId}`);

      // Forger view: signature + circle, each with reference polylines.
      const view = await request(app).get(`/api/forgery-study/${studyId}`);
      expect(view.status).toBe(200);
      expect(view.body.items.map((it: { itemType: string }) => it.itemType))
        .toEqual(['signature', 'circle']);
      expect(view.body.items[0].reference.strokes.length).toBeGreaterThan(0);

      // Submit an attempt — pass/fail only, no numeric score leaked.
      const attempt = await request(app)
        .post(`/api/forgery-study/${studyId}/attempt`)
        .send({
          signatureData: makeSignatureData(),
          shapes: [{ shapeType: 'circle', signatureData: makeSignatureData() }],
        });
      expect(attempt.status).toBe(200);
      expect(attempt.body).toHaveProperty('passed');
      expect(attempt.body.attemptIndex).toBe(1);
      expect(attempt.body.score).toBeUndefined();
      expect(attempt.body.combinedScore).toBeUndefined();

      // Results: the attempt is recorded with a per-item score breakdown.
      const results = await request(app)
        .get(`/api/forgery-study/${studyId}/results`)
        .set('X-Admin-Key', ADMIN);
      expect(results.status).toBe(200);
      expect(results.body.study.attemptCount).toBe(1);
      expect(results.body.attempts).toHaveLength(1);
      expect(results.body.attempts[0].itemScores).toHaveLength(2);
    });
  });
});
