import * as Location from 'expo-location';

// ok: fresh GPS fix · last_known: an older position (no fresh fix in time) · unavailable: no position ·
// denied: location permission refused. The server stores the same four values.
export type LocationStatus = 'ok' | 'last_known' | 'unavailable' | 'denied';

export type LocationReading = {
  status: LocationStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null; // metres
  mocked: boolean; // Android reports positions from fake-GPS apps
  servicesOff: boolean; // no position because location is switched off on the phone
};

export const FIX_TIMEOUT_MS = 15_000;
const GPS_FIRST_MS = 10_000;
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;
const CHECK_TIMEOUT_MS = 3_000; // permission, settings and last-known checks normally answer at once
const RETRY_PAUSE_MS = 1_000;

// E3: never keeps the form waiting long. Up to 15 s for a fresh fix, then a position from the last
// 5 minutes, then "unavailable" (the entry can be saved without one). Every step has a time limit,
// so the screen can't stay on "Getting location…".
export async function readLocation(): Promise<LocationReading> {
  try {
    const permission = await withTimeout(Location.getForegroundPermissionsAsync(), CHECK_TIMEOUT_MS);
    if (permission && !permission.granted) return noPosition('denied');

    const servicesOn = await isLocationOn();
    if (servicesOn) {
      const fix = await freshFix();
      if (fix) return fromFix('ok', fix);
    }
    const last = await withTimeout(
      Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }),
      CHECK_TIMEOUT_MS,
    ).catch(() => null);
    if (last) return fromFix('last_known', last);
    return { ...noPosition('unavailable'), servicesOff: !servicesOn };
  } catch {
    return noPosition('unavailable');
  }
}

// Location switched on in the phone's settings.
export async function isLocationOn(): Promise<boolean> {
  const on = await withTimeout(Location.hasServicesEnabledAsync(), CHECK_TIMEOUT_MS).catch(() => null);
  return on !== false;
}

// Shows Android's "Turn on location" dialog. Rejects if the user says no.
export function turnOnLocation(): Promise<void> {
  return Location.enableNetworkProviderAsync();
}

// GPS first. With no fix after 10 s, Wi-Fi and mobile-network positioning ("balanced"), which answers
// fast indoors. Right after location is switched on, Android may answer "unavailable" at once, so a
// failed request is repeated after a short pause until the 15 s are used up.
// mayShowUserSettingsDialog false: a read never opens Android's location dialog by itself. Otherwise
// expo-location parks the read until the dialog is answered, and shows the dialog only for the first
// parked request, so the form's "Turn on location" button could end up waiting behind it.
async function freshFix(): Promise<Location.LocationObject | null> {
  const start = Date.now();
  let elapsed = 0;
  while (elapsed < FIX_TIMEOUT_MS) {
    const gps = elapsed < GPS_FIRST_MS;
    try {
      const fix = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: gps ? Location.Accuracy.High : Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false,
        }),
        (gps ? GPS_FIRST_MS : FIX_TIMEOUT_MS) - elapsed,
      );
      if (fix) return fix;
    } catch {
      await sleep(RETRY_PAUSE_MS);
    }
    elapsed = Date.now() - start;
  }
  return null;
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
    servicesOff: false,
  };
}

function noPosition(status: 'unavailable' | 'denied'): LocationReading {
  return { status, latitude: null, longitude: null, accuracy: null, mocked: false, servicesOff: false };
}

// Resolves to null if the promise takes longer than ms.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
