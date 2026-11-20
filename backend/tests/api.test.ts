import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db';
import { TEST_API_KEY } from './testEnv';

const app = createApp();

afterAll(async () => {
  await pool.end();
});

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('GET /health', () => {
  it('answers without an API key', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/plants', () => {
  it('returns both plants, and each hash matches only that plant PIN from the brief', async () => {
    const res = await request(app).get('/api/plants').set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(200);
    const kolhapur = res.body.find((plant: { code: string }) => plant.code === 'KOLHAPUR');
    const up = res.body.find((plant: { code: string }) => plant.code === 'UP');

    // The same check the app runs offline: sha256(salt + PIN) === hash.
    expect(sha256(kolhapur.pinSalt + '1234')).toBe(kolhapur.pinHash);
    expect(sha256(up.pinSalt + '4567')).toBe(up.pinHash);
    expect(sha256(kolhapur.pinSalt + '4567')).not.toBe(kolhapur.pinHash);
    expect(sha256(up.pinSalt + '1234')).not.toBe(up.pinHash);
  });

  it('refuses a missing or wrong API key (401)', async () => {
    const missing = await request(app).get('/api/plants');
    const wrong = await request(app).get('/api/plants').set('x-api-key', 'wrong-key-0123456789');
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('unauthorized');
  });
});

describe('unknown routes', () => {
  it('answer 404 in the standard error format', async () => {
    const res = await request(app).get('/api/nope').set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'No such route' } });
  });
});
