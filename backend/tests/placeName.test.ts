import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db';
import { TEST_API_KEY } from './testEnv';

const app = createApp();

afterAll(async () => {
  await pool.end();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// The tests never call OpenStreetMap: fetch is replaced with a fixed answer.
function openStreetMapAnswers(body: unknown, status = 200) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('GET /api/place-name', () => {
  it('turns coordinates into a short place name and names the app to OpenStreetMap', async () => {
    const fetchMock = openStreetMapAnswers({
      address: { suburb: 'Rajarampuri', city: 'Kolhapur', state: 'Maharashtra', country: 'India' },
    });
    const res = await request(app).get('/api/place-name?lat=16.6950&lon=74.2433').set('x-api-key', TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Rajarampuri, Kolhapur, Maharashtra' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('lat=16.695');
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/^offline-truck-entry\//);
  });

  it('answers name null when OpenStreetMap fails, so the app shows no name', async () => {
    openStreetMapAnswers({ error: 'unavailable' }, 503);
    const res = await request(app).get('/api/place-name?lat=19.0760&lon=72.8777').set('x-api-key', TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: null });
  });

  it('refuses coordinates out of range (400)', async () => {
    const res = await request(app).get('/api/place-name?lat=91&lon=0').set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(400);
  });
});
