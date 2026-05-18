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
});
