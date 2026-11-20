import express from 'express';
import { pool } from './db';
import { requireApiKey } from './middleware/apiKey';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { plantsRouter } from './routes/plants';

// Builds the app without starting a server, so tests can send requests to it directly.
export function createApp() {
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework in every response

  app.use(requestLogger);

  // Open health check for Docker; it also proves the database answers.
  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  // Everything under /api needs the API key.
  app.use('/api', requireApiKey);
  app.use('/api/plants', plantsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
