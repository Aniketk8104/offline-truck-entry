import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_DB = 'truck_entry_test';
export const TEST_API_KEY = 'test-api-key-0123456789';
export const TEST_UPLOAD_DIR = path.join(os.tmpdir(), 'offline-truck-entry-test-uploads');

// Tests use the Postgres from docker-compose (login from the root .env), but their own
// database and upload folder, so they never touch development data.
export function useTestEnv(): void {
  const envFile = path.join(__dirname, '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  process.env.POSTGRES_DB = TEST_DB;
  process.env.API_KEY = TEST_API_KEY;
  process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
  process.env.LOG_LEVEL = 'silent';
}
