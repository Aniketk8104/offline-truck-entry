import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler';
import { lookupPlaceName } from '../services/placeName';
import { fieldErrors } from '../validation/submission';

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export const placeNameRouter = Router();

// GET /api/place-name?lat=16.705&lon=74.243 → { "name": "Rajarampuri, Kolhapur, Maharashtra" },
// or { "name": null } when no name can be found right now.
placeNameRouter.get('/', async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'validation_failed', 'Invalid query', fieldErrors(parsed.error));
  }
  res.json({ name: await lookupPlaceName(parsed.data.lat, parsed.data.lon) });
});
