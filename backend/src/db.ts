import { Pool } from 'pg';
import { config } from './config';
import { logger } from './logger';

// One shared pool: each query borrows a connection and gives it back.
export const pool = new Pool({ ...config.db, max: 10 });

// Without this listener, a dropped idle connection (e.g. Postgres restarted) would crash the API.
// Log only the message: pg attaches the whole connection object to this error.
pool.on('error', (err) => logger.error({ error: err.message }, 'idle database connection failed'));
