import NetInfo from '@react-native-community/netinfo';
import { File } from 'expo-file-system';
import { API_KEY, API_URL, APP_VERSION } from '../config';
import type { Plant } from '../db/plants';
import type { Submission } from '../db/submissions';

// A photo is about 100-170 KB: 60 s is enough even at 2G speed (~25 kbit/s).
const UPLOAD_TIMEOUT_MS = 60_000;
const PLANTS_TIMEOUT_MS = 15_000;
const PLACE_TIMEOUT_MS = 8_000;

export type UploadOutcome =
  | { kind: 'saved' } // 201 saved now, or 200 saved by an earlier try
  | { kind: 'rejected'; message: string } // the server says this entry is wrong: sending it again can't help
  | { kind: 'retry'; message: string }; // network or server trouble: send it again later

export async function uploadSubmission(s: Submission, deviceId: string): Promise<UploadOutcome> {
  const photo = new File(s.photoUri);
  if (!photo.exists) return { kind: 'rejected', message: 'The photo file is missing on this phone' };

  const form = new FormData();
  form.append('id', s.id);
  form.append('plantCode', s.plantCode);
  form.append('personName', s.personName);
  form.append('truckNumber', s.truckNumber);
  if (s.latitude !== null && s.longitude !== null) {
    form.append('latitude', String(s.latitude));
    form.append('longitude', String(s.longitude));
  }
  if (s.accuracy !== null) form.append('accuracy', String(s.accuracy));
  if (s.placeName) form.append('placeName', s.placeName);
  form.append('locationStatus', s.locationStatus);
  form.append('locationMocked', String(s.locationMocked));
  form.append('otp', s.otp);
  form.append('capturedAt', s.capturedAt);
  form.append('deviceId', deviceId);
  form.append('appVersion', APP_VERSION);
  // SDK 58's global fetch is Expo's, which reads file parts from an expo-file-system File.
  // (React Native's old { uri, name, type } object is not supported by it.)
  form.append('photo', photo);

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_URL}/api/submissions`,
      { method: 'POST', headers: { 'x-api-key': API_KEY }, body: form },
      UPLOAD_TIMEOUT_MS,
    );
  } catch (err) {
    // No answer at all (offline, dropped connection, timeout). The server may or may not have
    // saved it; resending the same id is safe either way.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('upload failed', s.id, reason);
    return { kind: 'retry', message: `Could not reach the server (${reason})` };
  }
  if (response.status === 201 || response.status === 200) return { kind: 'saved' };
  const message = await readError(response);
  if (response.status === 400 || response.status === 413) return { kind: 'rejected', message };
  return { kind: 'retry', message }; // 401, 5xx, proxy errors
}

// The server's plant list, or null if it can't be fetched right now.
export async function fetchPlants(): Promise<Plant[] | null> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/plants`, { headers: { 'x-api-key': API_KEY } }, PLANTS_TIMEOUT_MS);
    if (!response.ok) return null;
    const list: unknown = await response.json();
    if (!Array.isArray(list)) return null;
    return list.filter(
      (p): p is Plant =>
        typeof p?.code === 'string' && typeof p?.name === 'string' && typeof p?.pinSalt === 'string' && typeof p?.pinHash === 'string',
    );
  } catch {
    return null;
  }
}

// The place name for a position, from our API (which asks OpenStreetMap). null when offline or when no
// name can be found right now; never throws.
export async function fetchPlaceName(latitude: number, longitude: number): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false || net.isInternetReachable === false) return null;
    const response = await fetchWithTimeout(
      `${API_URL}/api/place-name?lat=${latitude}&lon=${longitude}`,
      { headers: { 'x-api-key': API_KEY } },
      PLACE_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { name?: unknown };
    return typeof body.name === 'string' && body.name.trim() !== '' ? body.name.slice(0, 300) : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// "Some fields are missing or invalid: OTP must be 6 digits", or the status code.
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string; fields?: Record<string, string> } };
    const fields = body.error?.fields ? Object.values(body.error.fields).join('; ') : '';
    return [body.error?.message, fields].filter(Boolean).join(': ') || `Server answered ${response.status}`;
  } catch {
    return `Server answered ${response.status}`;
  }
}
