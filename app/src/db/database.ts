import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { PLANTS_SEED } from './plantsSeed';

// Everything the app needs offline lives in this SQLite file in the app's private storage,
// so it survives closing the app and restarting the phone.
const SCHEMA_V1 = `
  CREATE TABLE plants (
    code      TEXT PRIMARY KEY NOT NULL,
    name      TEXT NOT NULL,
    pin_salt  TEXT NOT NULL,
    pin_hash  TEXT NOT NULL
  );
  CREATE TABLE pin_attempts (
    plant_code    TEXT PRIMARY KEY NOT NULL,
    failures      INTEGER NOT NULL,
    locked_until  INTEGER NOT NULL   -- ms since 1970; 0 = not locked
  );
  CREATE TABLE submissions (
    id               TEXT PRIMARY KEY NOT NULL,  -- UUID made on the phone; also the server's key
    plant_code       TEXT NOT NULL,
    person_name      TEXT NOT NULL,
    truck_number     TEXT NOT NULL,
    photo_uri        TEXT NOT NULL,
    latitude         REAL,
    longitude        REAL,
    accuracy         REAL,
    location_status  TEXT NOT NULL,
    location_mocked  INTEGER NOT NULL,
    otp              TEXT NOT NULL,
    captured_at      TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed')),
    attempts         INTEGER NOT NULL DEFAULT 0,
    next_attempt_at  INTEGER NOT NULL DEFAULT 0,  -- ms since 1970: don't resend before this
    last_error       TEXT,
    synced_at        TEXT
  );
  CREATE INDEX idx_submissions_due ON submissions (status, next_attempt_at);
  CREATE TABLE settings (
    key    TEXT PRIMARY KEY NOT NULL,
    value  TEXT NOT NULL
  );
`;

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

// Every module gets the database through this, so it is opened and set up only once.
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  opening ??= openAndMigrate().catch((err) => {
    opening = null; // let the next call try again
    throw err;
  });
  return opening;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('truck-entry.db');
  // WAL: the background sync can write while a screen reads.
  await db.execAsync('PRAGMA journal_mode = WAL');

  // user_version records which schema this phone has, so each setup step runs only once.
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA_V1);
      for (const plant of PLANTS_SEED) {
        await db.runAsync(
          'INSERT INTO plants (code, name, pin_salt, pin_hash) VALUES (?, ?, ?, ?)',
          plant.code,
          plant.name,
          plant.pinSalt,
          plant.pinHash,
        );
      }
      // A random id for this install, sent with each entry so the server can tell phones apart.
      await db.runAsync("INSERT INTO settings (key, value) VALUES ('device_id', ?)", Crypto.randomUUID());
      await db.execAsync('PRAGMA user_version = 1');
    });
  }
  // Version 2 adds the place name. A phone that already has version 1 (with its saved entries) runs
  // only this step.
  if (version < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync('ALTER TABLE submissions ADD COLUMN place_name TEXT');
      await db.execAsync('PRAGMA user_version = 2');
    });
  }
  return db;
}
