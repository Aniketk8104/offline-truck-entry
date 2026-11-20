import type { RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from './errorHandler';

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Keeps the photo in memory (at most 8 MB) so it can be checked before anything is written to disk.
const parsePhotoForm = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 20, fieldSize: 10 * 1024 },
}).single('photo');

// Turns multer's limit errors into our error format. Any other error (e.g. the connection
// dropped mid-upload) stays a 500, so the app treats it as temporary and retries.
export const photoUpload: RequestHandler = (req, res, next) => {
  parsePhotoForm(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new HttpError(413, 'photo_too_large', 'The photo is larger than 8 MB')
          : new HttpError(400, 'bad_upload', err.message),
      );
      return;
    }
    next(err);
  });
};
