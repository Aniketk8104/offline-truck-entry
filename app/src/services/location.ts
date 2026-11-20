import * as Location from 'expo-location';

// ok: fresh GPS fix · last_known: an older position (GPS timed out) · unavailable: no position ·
// denied: location permission refused. The server stores the same four values.
export type LocationStatus = 'ok' | 'last_known' | 'unavailable' | 'denied';

export type LocationReading = {
  status: LocationStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null; // metres
  mocked: boolean; // Android reports positions from fake-GPS apps
};

const FIX_TIMEOUT_MS = 15_000;
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

// E3: never blocks the form for long. Waits up to 15 s for a fresh fix, then falls back to a
// position from the last 5 minutes, then to "unavailable" (the entry is saved without one).
export async function readLocation(): Promise<LocationReading> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return noPosition('denied');

  try {
    const fix = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), FIX_TIMEOUT_MS);
    if (fix) return fromFix('ok', fix);
  } catch {
    // GPS switched off or no fix possible: try the last known position below.
  }
  const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null);
  return last ? fromFix('last_known', last) : noPosition('unavailable');
}

function fromFix(status: 'ok' | 'last_known', fix: Location.LocationObject): LocationReading {
  const { latitude, longitude, accuracy } = fix.coords;
  return {
    status,
    // 6 decimals (about 11 cm): the precision the server stores.
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy: accuracy === null ? null : Math.round(accuracy * 10) / 10,
    mocked: fix.mocked === true,
  };
}

function noPosition(status: 'unavailable' | 'denied'): LocationReading {
  return { status, latitude: null, longitude: null, accuracy: null, mocked: false };
}

// Resolves to null if the promise takes longer than ms.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
