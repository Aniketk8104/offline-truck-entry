import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db';
import { MAX_PHOTO_BYTES } from '../src/middleware/upload';
import { TEST_API_KEY, TEST_UPLOAD_DIR } from './testEnv';

const app = createApp();

// The server checks only the first bytes (FF D8 FF = JPEG), so a short fake image is enough.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1000, 7)]);

type Fields = Record<string, string | undefined>;

function validFields(id: string, overrides: Fields = {}): Fields {
  return {
    id,
    plantCode: 'KOLHAPUR',
    personName: 'Ravi Patil',
    truckNumber: 'MH09AB1234',
    latitude: '16.704987',
    longitude: '74.243253',
    accuracy: '12.5',
    locationStatus: 'ok',
    locationMocked: 'false',
    otp: '482913',
    capturedAt: new Date().toISOString(),
    deviceId: 'test-device',
    appVersion: '1.0.0',
    ...overrides,
  };
}

// Sends the form the way the app does: multipart fields plus the photo file.
function post(fields: Fields, photo: Buffer | null = JPEG) {
  const req = request(app).post('/api/submissions').set('x-api-key', TEST_API_KEY);
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) req.field(name, value);
  }
  if (photo) req.attach('photo', photo, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  return req;
}

async function rowCount(id: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM submissions WHERE id = $1', [id]);
  return rows[0].n;
}

afterAll(async () => {
  await pool.end();
});

describe('POST /api/submissions', () => {
  it('saves a new submission and its photo (201)', async () => {
    const id = randomUUID();
    const res = await post(validFields(id));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id,
      plantCode: 'KOLHAPUR',
      personName: 'Ravi Patil',
      truckNumber: 'MH09AB1234',
      latitude: 16.704987,
      longitude: 74.243253,
      locationStatus: 'ok',
      otp: '482913',
      photoUrl: `/api/submissions/${id}/photo`,
    });
    expect(await rowCount(id)).toBe(1);
    expect(await readFile(path.join(TEST_UPLOAD_DIR, `${id}.jpg`))).toEqual(JPEG);
  });

  it('saves one row when the same submission is sent twice, and answers 200 the second time', async () => {
    const id = randomUUID();
    const fields = validFields(id);
    const first = await post(fields);
    const retry = await post(fields);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.receivedAt).toBe(first.body.receivedAt); // the stored row, not a new one
    expect(await rowCount(id)).toBe(1);
  });

  it('saves one row when two copies arrive at the same moment', async () => {
    const id = randomUUID();
    const fields = validFields(id);
    const [a, b] = await Promise.all([post(fields), post(fields)]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await rowCount(id)).toBe(1);
  });

  it('cleans up the truck number: "mh 09 ab-1234" is stored as "MH09AB1234"', async () => {
    const res = await post(validFields(randomUUID(), { truckNumber: 'mh 09 ab-1234' }));
    expect(res.status).toBe(201);
    expect(res.body.truckNumber).toBe('MH09AB1234');
  });

  it.each(['unavailable', 'denied'])('saves a submission without a position when location is %s', async (status) => {
    const res = await post(validFields(randomUUID(), { locationStatus: status, latitude: undefined, longitude: undefined, accuracy: undefined }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ locationStatus: status, latitude: null, longitude: null });
  });

  it('saves an older last-known position when there was no fresh GPS fix', async () => {
    const res = await post(validFields(randomUUID(), { locationStatus: 'last_known' }));
    expect(res.status).toBe(201);
    expect(res.body.locationStatus).toBe('last_known');
  });

  it('names every missing field (400)', async () => {
    const id = randomUUID();
    const res = await post({ id }, null);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(Object.keys(res.body.error.fields)).toEqual(
      expect.arrayContaining(['plantCode', 'personName', 'truckNumber', 'locationStatus', 'otp', 'capturedAt', 'photo']),
    );
    expect(await rowCount(id)).toBe(0);
  });

  it.each([
    ['a 5-digit OTP', { otp: '12345' }, 'otp'],
    ['a one-letter name', { personName: ' A ' }, 'personName'],
    ['a truck number with symbols', { truckNumber: 'MH09#1234' }, 'truckNumber'],
    ['latitude 91', { latitude: '91' }, 'latitude'],
    ['a latitude that is not a number', { latitude: 'abc' }, 'latitude'],
    ['an id that is not a UUID', { id: 'not-a-uuid' }, 'id'],
    ['status ok without a position', { latitude: undefined, longitude: undefined }, 'locationStatus'],
    ['status denied with a position', { locationStatus: 'denied' }, 'locationStatus'],
  ])('refuses %s (400)', async (_label, overrides, field) => {
    const res = await post(validFields(randomUUID(), overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty(field);
  });

  it('refuses an unknown plant (400) and saves nothing', async () => {
    const id = randomUUID();
    const res = await post(validFields(id, { plantCode: 'NOPE' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_plant');
    expect(await rowCount(id)).toBe(0);
    expect(existsSync(path.join(TEST_UPLOAD_DIR, `${id}.jpg`))).toBe(false);
  });

  it('refuses a file that is not a JPEG or PNG, whatever its name says (400)', async () => {
    const id = randomUUID();
    const res = await post(validFields(id), Buffer.from('<html>not a photo</html>'));

    expect(res.status).toBe(400);
    expect(res.body.error.fields.photo).toBe('The photo must be a JPEG or PNG image');
    expect(await rowCount(id)).toBe(0);
  });

  it('refuses a photo over 8 MB (413) and saves nothing', async () => {
    const id = randomUUID();
    const big = Buffer.alloc(MAX_PHOTO_BYTES + 1);
    JPEG.copy(big);
    const res = await post(validFields(id), big);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('photo_too_large');
    expect(await rowCount(id)).toBe(0);
  });

  it('refuses a missing API key (401)', async () => {
    const res = await request(app).post('/api/submissions').field('id', randomUUID());
    expect(res.status).toBe(401);
  });
});

describe('GET /api/submissions', () => {
  it('lists a plant newest first, and the photo link returns the stored photo', async () => {
    const olderId = randomUUID();
    const newerId = randomUUID();
    await post(validFields(olderId, { plantCode: 'UP', capturedAt: '2026-11-20T08:00:00.000Z' }));
    await post(validFields(newerId, { plantCode: 'UP', capturedAt: '2026-11-20T09:00:00.000Z' }));

    const list = await request(app).get('/api/submissions?plantCode=UP').set('x-api-key', TEST_API_KEY);
    expect(list.status).toBe(200);
    expect(list.body.map((s: { id: string }) => s.id)).toEqual([newerId, olderId]);

    const photo = await request(app).get(list.body[0].photoUrl).set('x-api-key', TEST_API_KEY);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(photo.body, JPEG)).toBe(0);
  });

  it('answers 404 for the photo of an unknown id', async () => {
    const res = await request(app).get(`/api/submissions/${randomUUID()}/photo`).set('x-api-key', TEST_API_KEY);
    expect(res.status).toBe(404);
  });
});
