import { Router } from 'express';
import { pool } from '../db';

type PlantRow = { code: string; name: string; pin_salt: string; pin_hash: string };

export const plantsRouter = Router();

// The app keeps its own copy of this list so the PIN check works offline;
// when it is online it refreshes that copy from here.
plantsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query<PlantRow>(
    'SELECT code, name, pin_salt, pin_hash FROM plants WHERE is_active ORDER BY name',
  );
  res.json(rows.map((row) => ({ code: row.code, name: row.name, pinSalt: row.pin_salt, pinHash: row.pin_hash })));
});
