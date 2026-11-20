import type { RequestHandler } from 'express';
import { logger } from '../logger';

// One log line per request once the response is sent: method, URL, status, time taken.
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info(
      { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - startedAt },
      'request',
    );
  });
  next();
};
