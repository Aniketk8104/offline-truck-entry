import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { pool } from '../db';
import { HttpError } from '../middleware/errorHandler';
import type { SubmissionInput } from '../validation/submission';
import type { ImageType } from './photo';

export type SubmissionRow = {
  id: string;
  plant_code: string;
  person_name: string;
  truck_number: string;
  photo_path: string;
  photo_mime: string;
  photo_bytes: number;
  latitude: string | null; // pg returns NUMERIC as text, so no precision is lost
  longitude: string | null;
  location_accuracy_m: number | null;
  place_name: string | null;
  location_status: string;
  location_mocked: boolean;
  otp: string;
  captured_at: Date;
  received_at: Date;
  device_id: string | null;
  app_version: string | null;
};

// Saves a submission exactly once. The phone sends the same id again when it never got our
// answer (for example the network dropped); then nothing new is saved and the stored row is returned.
export async function saveSubmission(
  input: SubmissionInput,
  photo: Buffer,
  photoType: ImageType,
): Promise<{ created: boolean; row: SubmissionRow }> {
  const photoPath = `${input.id}.${photoType.ext}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const plant = await client.query('SELECT 1 FROM plants WHERE code = $1', [input.plantCode]);
    if (plant.rowCount === 0) {
      throw new HttpError(400, 'unknown_plant', 'Unknown plant', { plantCode: 'No plant with this code' });
    }

    // Inserts nothing if this id is already saved. If another request is saving the same id
    // right now, Postgres makes this one wait for it, so two copies can never both be saved.
    const inserted = await client.query<SubmissionRow>(
      `INSERT INTO submissions (id, plant_code, person_name, truck_number, photo_path, photo_mime, photo_bytes,
         latitude, longitude, location_accuracy_m, location_status, location_mocked, otp, captured_at,
         device_id, app_version, place_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [
        input.id,
        input.plantCode,
        input.personName,
        input.truckNumber,
        photoPath,
        photoType.mime,
        photo.length,
        input.latitude ?? null,
        input.longitude ?? null,
        input.accuracy ?? null,
        input.locationStatus,
        input.locationMocked,
        input.otp,
        input.capturedAt,
        input.deviceId ?? null,
        input.appVersion ?? null,
        input.placeName ?? null,
      ],
    );

    if (inserted.rows.length === 1) {
      // The photo is written before COMMIT, so a saved row always has its photo on disk.
      // If writing fails, ROLLBACK removes the row and the app simply retries later.
      await mkdir(config.uploadDir, { recursive: true });
      await writeFile(path.join(config.uploadDir, photoPath), photo);
      await client.query('COMMIT');
      return { created: true, row: inserted.rows[0] };
    }

    const existing = await client.query<SubmissionRow>('SELECT * FROM submissions WHERE id = $1', [input.id]);
    await client.query('COMMIT');
    return { created: false, row: existing.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined); // the connection may already be broken
    throw err;
  } finally {
    client.release();
  }
}

export async function listSubmissions(plantCode: string | undefined, limit: number): Promise<SubmissionRow[]> {
  const { rows } = await pool.query<SubmissionRow>(
    `SELECT * FROM submissions
     WHERE ($1::text IS NULL OR plant_code = $1)
     ORDER BY captured_at DESC
     LIMIT $2`,
    [plantCode ?? null, limit],
  );
  return rows;
}

export async function findPhotoPath(id: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ photo_path: string }>('SELECT photo_path FROM submissions WHERE id = $1', [id]);
  return rows[0]?.photo_path;
}
