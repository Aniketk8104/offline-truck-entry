import * as Crypto from 'expo-crypto';
import { getDb } from '../db/database';
import { getPlant } from '../db/plants';

export const MAX_WRONG_TRIES = 5;
export const LOCK_MINUTES = 5;

export type PinCheck =
  | { result: 'ok' }
  | { result: 'wrong'; triesLeft: number }
  | { result: 'locked'; lockedUntil: number };

type AttemptRow = { failures: number; locked_until: number };

async function readAttempt(plantCode: string): Promise<AttemptRow> {
  const db = await getDb();
  const row = await db.getFirstAsync<AttemptRow>(
    'SELECT failures, locked_until FROM pin_attempts WHERE plant_code = ?',
    plantCode,
  );
  return row ?? { failures: 0, locked_until: 0 };
}

async function saveAttempt(plantCode: string, failures: number, lockedUntil: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO pin_attempts (plant_code, failures, locked_until) VALUES (?, ?, ?)',
    plantCode,
    failures,
    lockedUntil,
  );
}

// 0 when the plant is not locked.
export async function getLockedUntil(plantCode: string): Promise<number> {
  const attempt = await readAttempt(plantCode);
  return attempt.locked_until > Date.now() ? attempt.locked_until : 0;
}

// Checked on the phone, so the form opens without a network: sha256(salt + PIN) must equal the
// plant's stored hash. Wrong tries are counted in SQLite, so closing the app doesn't reset them.
export async function checkPin(plantCode: string, pin: string): Promise<PinCheck> {
  const now = Date.now();
  const attempt = await readAttempt(plantCode);
  if (attempt.locked_until > now) return { result: 'locked', lockedUntil: attempt.locked_until };

  const plant = await getPlant(plantCode);
  if (plant) {
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, plant.pinSalt + pin);
    if (hash.toLowerCase() === plant.pinHash.toLowerCase()) {
      await saveAttempt(plantCode, 0, 0);
      return { result: 'ok' };
    }
  }

  const failures = attempt.failures + 1;
  if (failures >= MAX_WRONG_TRIES) {
    const lockedUntil = now + LOCK_MINUTES * 60_000;
    await saveAttempt(plantCode, 0, lockedUntil); // after the lock, the count starts again
    return { result: 'locked', lockedUntil };
  }
  await saveAttempt(plantCode, failures, 0);
  return { result: 'wrong', triesLeft: MAX_WRONG_TRIES - failures };
}
