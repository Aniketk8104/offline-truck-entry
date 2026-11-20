import type { LocationStatus } from '../services/location';
import { getDb } from './database';

// pending = saved on the phone, not on the server yet · synced = the server has it ·
// failed = the server refused it (bad data), so it is not sent again.
export type SubmissionStatus = 'pending' | 'synced' | 'failed';

export type Submission = {
  id: string;
  plantCode: string;
  personName: string;
  truckNumber: string;
  photoUri: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  locationStatus: LocationStatus;
  locationMocked: boolean;
  otp: string;
  capturedAt: string; // ISO time when Submit was pressed
  status: SubmissionStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  syncedAt: string | null;
};

export type NewSubmission = Omit<Submission, 'status' | 'attempts' | 'nextAttemptAt' | 'lastError' | 'syncedAt'>;

type Row = {
  id: string;
  plant_code: string;
  person_name: string;
  truck_number: string;
  photo_uri: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  location_status: LocationStatus;
  location_mocked: number;
  otp: string;
  captured_at: string;
  status: SubmissionStatus;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  synced_at: string | null;
};

function fromRow(r: Row): Submission {
  return {
    id: r.id,
    plantCode: r.plant_code,
    personName: r.person_name,
    truckNumber: r.truck_number,
    photoUri: r.photo_uri,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracy: r.accuracy,
    locationStatus: r.location_status,
    locationMocked: r.location_mocked === 1,
    otp: r.otp,
    capturedAt: r.captured_at,
    status: r.status,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    syncedAt: r.synced_at,
  };
}

// Saved as pending with next_attempt_at = 0, so the next sync sends it straight away.
export async function insertSubmission(s: NewSubmission): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO submissions (id, plant_code, person_name, truck_number, photo_uri, latitude, longitude,
       accuracy, location_status, location_mocked, otp, captured_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    s.id,
    s.plantCode,
    s.personName,
    s.truckNumber,
    s.photoUri,
    s.latitude,
    s.longitude,
    s.accuracy,
    s.locationStatus,
    s.locationMocked ? 1 : 0,
    s.otp,
    s.capturedAt,
  );
}

export async function listSubmissions(): Promise<Submission[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM submissions ORDER BY captured_at DESC LIMIT 200');
  return rows.map(fromRow);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM submissions WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

// The oldest waiting entry whose retry time has come, so entries reach the server in the order
// they were made.
export async function nextDueSubmission(now: number): Promise<Submission | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>(
    "SELECT * FROM submissions WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY captured_at LIMIT 1",
    now,
  );
  return row ? fromRow(row) : null;
}

export async function countPending(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM submissions WHERE status = 'pending'");
  return row?.n ?? 0;
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE submissions SET status = 'synced', synced_at = ?, last_error = NULL WHERE id = ?",
    new Date().toISOString(),
    id,
  );
}

export async function markFailed(id: string, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE submissions SET status = 'failed', last_error = ? WHERE id = ?", message, id);
}

export async function scheduleRetry(id: string, attempts: number, nextAttemptAt: number, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE submissions SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
    attempts,
    nextAttemptAt,
    message,
    id,
  );
}

// The network came back or the user tapped "Send now": nothing waiting should wait longer.
export async function makePendingDueNow(): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE submissions SET next_attempt_at = 0 WHERE status = 'pending'");
}

export async function getDeviceId(): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'device_id'");
  return row?.value ?? 'unknown';
}
