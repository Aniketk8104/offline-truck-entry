import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../config';
import { HttpError } from './errorHandler';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

const expectedKey = sha256(config.apiKey);

// Hashing both sides gives equal-length buffers, and timingSafeEqual takes the same time
// whether a guess is close or not, so response times don't leak the key.
export const requireApiKey: RequestHandler = (req, _res, next) => {
  const givenKey = sha256(req.get('x-api-key') ?? '');
  if (!timingSafeEqual(givenKey, expectedKey)) {
    next(new HttpError(401, 'unauthorized', 'Missing or wrong API key'));
    return;
  }
  next();
};
