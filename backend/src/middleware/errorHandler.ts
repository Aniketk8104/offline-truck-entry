import type { ErrorRequestHandler, RequestHandler } from 'express';
import { DatabaseError } from 'pg';
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
  // Postgres refused the values themselves: SQLSTATE class 22 is bad data (e.g. a character text can't
  // hold), class 23 a broken rule (CHECK, foreign key). That is the client's data, not an outage, so
  // answer 400: the app then marks the entry refused instead of resending it forever.
  if (err instanceof DatabaseError && /^2[23]/.test(err.code ?? '')) {
    logger.warn({ code: err.code, constraint: err.constraint }, 'database refused the values');
    res.status(400).json({ error: { code: 'invalid_data', message: 'The server could not store these values' } });
    return;
  }
  // Anything else is a bug or an outage: log the details, send only a generic message.
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on the server' } });
};
