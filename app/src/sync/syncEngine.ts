import NetInfo from '@react-native-community/netinfo';
import { API_URL } from '../config';
import { replacePlants } from '../db/plants';
import { getDeviceId, listDueSubmissions, makePendingDueNow, markFailed, markSynced, scheduleRetry } from '../db/submissions';
import { deletePhoto } from '../services/photo';
import { fetchPlants, uploadSubmission } from './api';

const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 10 * 60_000;
const PLANTS_REFRESH_MS = 10 * 60_000;

let running: Promise<void> | null = null;
let plantsRefreshedAt = 0;
const listeners = new Set<() => void>();

// Screens subscribe to redraw when an entry or the plant list changes.
export function onSyncChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

// Sends every entry that is due. One run at a time: a call during a run gets that run.
// Even if two runs overlapped, nothing is stored twice: the server answers 200 for an id it has.
export function syncNow(): Promise<void> {
  running ??= runSync()
    .catch((err) => console.warn('sync failed', err))
    .finally(() => {
      running = null;
    });
  return running;
}

// The network came back, or the user tapped "Send now": nothing should keep waiting.
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
  for (const entry of await listDueSubmissions(Date.now())) {
    const outcome = await uploadSubmission(entry, deviceId);
    if (outcome.kind === 'saved') {
      await markSynced(entry.id);
      deletePhoto(entry.photoUri); // the server has it now
    } else if (outcome.kind === 'rejected') {
      await markFailed(entry.id, outcome.message);
    } else {
      // Wait 5 s, 10 s, 20 s ... up to 10 min before trying this entry again, so a struggling
      // server isn't flooded. The other entries wait for the next run.
      const wait = Math.min(FIRST_RETRY_MS * 2 ** entry.attempts, MAX_RETRY_MS);
      await scheduleRetry(entry.id, entry.attempts + 1, Date.now() + wait, outcome.message);
      notify();
      return;
    }
    notify();
  }
}
