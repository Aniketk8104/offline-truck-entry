import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { TEST_DB, TEST_UPLOAD_DIR, useTestEnv } from './testEnv';

// Builds the test database from the real migration files, so every run also proves they work.
export default async function globalSetup(): Promise<void> {
  useTestEnv();
  const login = {
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  };

  // A database name can't be a query parameter; TEST_DB is a fixed constant, not user input.
  const admin = new Client({ ...login, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const db = new Client({ ...login, database: TEST_DB });
  await db.connect();
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    await db.query(await readFile(path.join(migrationsDir, file), 'utf8'));
  }
  await db.end();

  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
  await mkdir(TEST_UPLOAD_DIR, { recursive: true });
}
