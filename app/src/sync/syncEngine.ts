import NetInfo from '@react-native-community/netinfo';
import { API_URL } from '../config';
import { replacePlants } from '../db/plants';
import {
  getDeviceId,
  makePendingDueNow,
  markFailed,
  markSynced,
  nextDueSubmission,
  scheduleRetry,
  setPlaceName,
} from '../db/submissions';
import { deletePhoto } from '../services/photo';
import { fetchPlaceName, fetchPlants, uploadSubmission } from './api';

const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 10 * 60_000;
const PLANTS_REFRESH_MS = 10 * 60_000;

let running: Promise<void> | null = null;
let plantsRefreshedAt = 0;
const listeners = new Set<() => void>();

// Screens subscribe to redraw when entries, their status or the plant list may have changed.
export function onSyncChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

// Sends every entry that is due. One run at a time: a call during a run gets that run, and the run
// also picks up entries saved while it is going. Even if two runs overlapped, nothing would be
// stored twice: the server answers 200 for an id it already has.
export function syncNow(): Promise<void> {
  running ??= runSync()
    .catch((err) => console.warn('sync failed', err))
    .finally(() => {
      running = null;
      notify(); // also after an offline check, so a new entry's "waiting" count shows at once
    });
  return running;
}

// The user is looking at the app (opened, back in front, "Send now") or the network came back:
// entries still waiting for their next retry are sent now too.
export async function syncAllNow(): Promise<void> {
  await makePendingDueNow();
  await syncNow();
}

async function runSync(): Promise<void> {
  if (!API_URL) return; // this build has no server address
  const net = await NetInfo.fetch();
  if (net.isConnected === false || net.isInternetReachable === false) return; // offline: wait for the network

  if (Date.now() - plantsRefreshedAt > PLANTS_REFRESH_MS) {
    const plants = await fetchPlants();
    if (plants) {
      await replacePlants(plants);
      plantsRefreshedAt = Date.now();
      notify();
    }
  }

  const deviceId = await getDeviceId();
  let lookUpPlaces = true;
  // One entry at a time, oldest first. SQLite is asked again for each one, so an entry saved
  // during this run is sent in this run too.
  for (;;) {
    let entry = await nextDueSubmission(Date.now());
    if (!entry) return;

    // An entry made offline gets its place name now that the phone is online. Best effort: if the
    // lookup fails, the entry is sent without one, and the rest of this run skips the lookup.
    if (lookUpPlaces && entry.placeName === null && entry.latitude !== null && entry.longitude !== null) {
      const name = await fetchPlaceName(entry.latitude, entry.longitude);
      if (name) {
        await setPlaceName(entry.id, name);
        entry = { ...entry, placeName: name };
      } else {
        lookUpPlaces = false;
      }
    }

    const outcome = await uploadSubmission(entry, deviceId);
    if (outcome.kind === 'saved') {
      await markSynced(entry.id);
      deletePhoto(entry.photoUri); // the server has it now
    } else if (outcome.kind === 'rejected') {
      await markFailed(entry.id, outcome.message);
    } else {
      // Wait 5 s, 10 s, 20 s ... up to 10 min before trying this entry again, so a struggling
      // server isn't flooded. The server can't be reached now, so the rest waits for the next run.
      const wait = Math.min(FIRST_RETRY_MS * 2 ** entry.attempts, MAX_RETRY_MS);
      await scheduleRetry(entry.id, entry.attempts + 1, Date.now() + wait, outcome.message);
      return;
    }
    notify();
  }
}
