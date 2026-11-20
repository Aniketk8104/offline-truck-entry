import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { logger } from './logger';

const server = createApp().listen(config.port, (error?: Error) => {
  if (error) throw error; // e.g. the port is already in use: stop instead of running half-started
  logger.info({ port: config.port }, 'API listening');
});

// Docker stops a container with SIGTERM: stop taking new requests, let open ones finish,
// close the database connections, then exit.
function shutDown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutDown('SIGTERM'));
process.on('SIGINT', () => shutDown('SIGINT'));
