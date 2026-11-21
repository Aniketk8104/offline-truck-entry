import { config } from '../config';
import { logger } from '../logger';

// Reverse geocoding: coordinates → "Rajarampuri, Kolhapur, Maharashtra", from OpenStreetMap's public
// Nominatim service (https://operations.osmfoundation.org/policies/nominatim/). Its rules, and how this
// file keeps them: at most 1 request per second (one call at a time, 1.1 s apart); a User-Agent that
// names the app; cached results (here in memory, and each entry stores its name); credit to
// OpenStreetMap wherever names are shown (the app does). The phone asks our API rather than
// OpenStreetMap, so the service can be switched on the server (GEOCODER_URL) without a new APK, as the
// policy asks of apps. A name is only a label for people: the coordinates stay the real record, so any
// failure here just means "no name".
const USER_AGENT = 'offline-truck-entry/1.0 (+https://github.com/Aniketk8104/offline-truck-entry)';
const TIMEOUT_MS = 5_000;
const MIN_GAP_MS = 1_100;
const CACHE_SIZE = 1_000;

type Reverse = { display_name?: string; address?: Record<string, string | undefined> };

const cache = new Map<string, string | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

export function lookupPlaceName(latitude: number, longitude: number): Promise<string | null> {
  // 4 decimals is about 11 m: positions that close share one lookup.
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);

  const result = queue.then(async () => {
    if (cache.has(key)) return cache.get(key) ?? null; // looked up while this call waited its turn
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    const name = await fetchName(latitude, longitude);
    if (name !== undefined) remember(key, name);
    return name ?? null;
  });
  queue = result.catch(() => undefined);
  return result.catch(() => null);
}

// undefined when the service failed (not cached, so a later entry tries again);
// null when it answered without a usable name.
async function fetchName(latitude: number, longitude: number): Promise<string | null | undefined> {
  const url = new URL(config.geocoderUrl);
  url.search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '16', // street and neighbourhood level
    addressdetails: '1',
    'accept-language': 'en',
  }).toString();
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'place name lookup failed');
      return undefined;
    }
    return shortName((await response.json()) as Reverse);
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'place name lookup failed');
    return undefined;
  }
}

// "Rajarampuri, Kolhapur, Maharashtra": the local area, the town or city, and the state.
function shortName(place: Reverse): string | null {
  const a = place.address ?? {};
  const parts = [
    a.neighbourhood ?? a.suburb ?? a.quarter ?? a.village ?? a.hamlet ?? a.road,
    a.city ?? a.town ?? a.municipality ?? a.county ?? a.state_district,
    a.state,
  ].filter((part): part is string => Boolean(part));
  const name = parts.length > 0 ? [...new Set(parts)].join(', ') : (place.display_name ?? '');
  return name.trim().slice(0, 200) || null;
}

function remember(key: string, name: string | null): void {
  cache.set(key, name);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}
