import path from 'node:path';
import { z } from 'zod';

// Every setting comes from environment variables, so no secret is written in the code.
// Locally they come from ../.env (npm run dev); in Docker, from docker-compose.yml.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  API_KEY: z.string().min(16),
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // Name the bad variables, never their values (they may be secrets).
  const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Missing or invalid environment variables: ${names}`);
}
const env = result.data;

export const config = {
  port: env.PORT,
  apiKey: env.API_KEY,
  logLevel: env.LOG_LEVEL,
  uploadDir: path.resolve(env.UPLOAD_DIR), // truck photos, one file per submission

  db: {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  },
};
