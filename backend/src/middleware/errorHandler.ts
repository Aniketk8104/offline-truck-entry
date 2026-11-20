import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../logger';

// An error the client caused (bad input, wrong key). Its message is safe to send back.
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'not_found', 'No such route'));
};

// Every error leaves the API in one shape: { error: { code, message, fields? } }.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  // Anything else is a bug or an outage: log the details, send only a generic message.
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on the server' } });
};
