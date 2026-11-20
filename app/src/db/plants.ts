import { getDb } from './database';

export type Plant = { code: string; name: string; pinSalt: string; pinHash: string };

type PlantRow = { code: string; name: string; pin_salt: string; pin_hash: string };

function fromRow(row: PlantRow): Plant {
  return { code: row.code, name: row.name, pinSalt: row.pin_salt, pinHash: row.pin_hash };
}

export async function listPlants(): Promise<Plant[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PlantRow>('SELECT * FROM plants ORDER BY name');
  return rows.map(fromRow);
}

export async function getPlant(code: string): Promise<Plant | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PlantRow>('SELECT * FROM plants WHERE code = ?', code);
  return row ? fromRow(row) : null;
}

// Replaces the offline copy with the server's list (new plants, changed PINs, removed plants).
// An empty list is ignored, so a server mistake can't leave the phone without plants.
export async function replacePlants(plants: Plant[]): Promise<void> {
  if (plants.length === 0) return;
  const db = await getDb();
  // Exclusive: a screen reading the list never sees it half-replaced.
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM plants');
    for (const p of plants) {
      await txn.runAsync(
        'INSERT INTO plants (code, name, pin_salt, pin_hash) VALUES (?, ?, ?, ?)',
        p.code,
        p.name,
        p.pinSalt,
        p.pinHash,
      );
    }
  });
}
