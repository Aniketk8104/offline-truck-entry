import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { HttpError } from '../middleware/errorHandler';
import { photoUpload } from '../middleware/upload';
import { detectImageType } from '../services/photo';
import { findPhotoPath, listSubmissions, saveSubmission, type SubmissionRow } from '../services/submissionService';
import { fieldErrors, submissionSchema } from '../validation/submission';

export const submissionsRouter = Router();

// 201 = saved now, 200 = this id was already saved (a retry). The app treats both as "synced".
submissionsRouter.post('/', photoUpload, async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body ?? {});
  const fields: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error);
  const photoType = req.file ? detectImageType(req.file.buffer) : null;
  if (!req.file) fields.photo = 'A photo is required';
  else if (!photoType) fields.photo = 'The photo must be a JPEG or PNG image';

  if (!parsed.success || !req.file || !photoType) {
    throw new HttpError(400, 'validation_failed', 'Some fields are missing or invalid', fields);
  }
  const { created, row } = await saveSubmission(parsed.data, req.file.buffer, photoType);
  res.status(created ? 201 : 200).json(toApi(row));
});

const listQuery = z.object({
  plantCode: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Newest first. Used in the demo to show that entries made offline reached the database.
submissionsRouter.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'validation_failed', 'Invalid query', fieldErrors(parsed.error));
  }
  const rows = await listSubmissions(parsed.data.plantCode, parsed.data.limit);
  res.json(rows.map(toApi));
});

submissionsRouter.get('/:id/photo', async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  const photoPath = id.success ? await findPhotoPath(id.data) : undefined;
  if (!photoPath) {
    throw new HttpError(404, 'not_found', 'No submission with this id');
  }
  res.sendFile(photoPath, { root: config.uploadDir });
});

function toApi(row: SubmissionRow) {
  return {
    id: row.id,
    plantCode: row.plant_code,
    personName: row.person_name,
    truckNumber: row.truck_number,
    photoUrl: `/api/submissions/${row.id}/photo`,
    photoMime: row.photo_mime,
    photoBytes: row.photo_bytes,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    accuracy: row.location_accuracy_m,
    placeName: row.place_name,
    locationStatus: row.location_status,
    locationMocked: row.location_mocked,
    otp: row.otp,
    capturedAt: row.captured_at,
    receivedAt: row.received_at,
    deviceId: row.device_id,
    appVersion: row.app_version,
  };
}
