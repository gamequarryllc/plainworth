import { AppState } from 'react-native';
import { create } from 'zustand';

import { newId } from '@/lib/id';
import { storage } from '@/lib/storage';
import { cloudFolder, cloudSupported } from '@/lib/sync/cloud';
import type { SyncStatus } from '@/lib/sync/engine';
import { createProfilesSync, type BothHave } from '@/lib/sync/profiles';
import type { Data, ID } from '@/lib/types';

import { checkedData } from './backup';
import { DATA_VERSION } from './defaults';
import { currentData, DATA_KEYS, flushSave, isReplacing, isSwitching, useStore } from './index';
import { activeProfile, useProfiles } from './profile-list';
import { addProfile, deleteProfile, onProfileChanges, profileData, setProfileData } from './profiles';

/**
 * Sync with iCloud, off unless the person turns it on in Settings.
 *
 * While it's off, nothing here touches iCloud: no reads, no writes, no checks.
 * Turned on, each change is saved on the phone first, exactly as without sync,
 * and then sent to the person's own private iCloud so their other devices can
 * pick it up. How devices' copies are merged is in `src/lib/sync`. Every
 * profile syncs, whichever one is open.
 */

export { cloudSupported };

/** Sync's own saved state: "all" for the device, "p.<profile>" for each profile. */
const stateKey = (key: string) => `tally.sync.${key}`;
/** A profile's data that turning sync on (or another device) last replaced, kept in case that was the wrong call. */
const replacedKey = (id: ID) => `tally.sync.replaced.${id}`;

/** How soon after a change it's sent, so a burst of edits goes as one. */
const SEND_AFTER_MS = 2_000;
/** How often to look for other devices' changes while the app is open. */
const CHECK_EVERY_MS = 15_000;

export interface Replaced {
  at: number;
  /** Whose data it was: this device's, or what was in iCloud. */
  from: 'device' | 'icloud';
}

interface SyncStore extends SyncStatus {
  /** For the profile that's open. */
  replaced: Replaced | null;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = storage.read(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readReplaced(id: ID): Replaced | null {
  const saved = readJSON<Replaced>(replacedKey(id));
  return saved && typeof saved.at === 'number'
    ? { at: saved.at, from: saved.from === 'icloud' ? 'icloud' : 'device' }
    : null;
}

export const useSync = create<SyncStore>(() => ({ on: false, busy: false, replaced: null }));

function keepReplaced(id: ID, data: Data, from: Replaced['from']) {
  const at = Date.now();
  storage.write(replacedKey(id), JSON.stringify({ at, from, data })).catch(() => {});
  if (id === activeProfile()) useSync.setState({ replaced: { at, from } });
}

const sync = createProfilesSync({
  cloud: cloudFolder,
  dataVersion: DATA_VERSION,
  profiles: () => {
    const { list, gone } = useProfiles.getState();
    return { list, gone };
  },
  addProfile: (p) => {
    addProfile({ id: p.id, createdAt: p.createdAt, elsewhere: true });
  },
  removeProfile: (id, at) => {
    deleteProfile(id, { at, elsewhere: true });
    storage.remove(replacedKey(id)).catch(() => {});
  },
  getData: profileData,
  setData: setProfileData,
  readData: checkedData,
  loadState: (key) => readJSON<unknown>(stateKey(key)),
  saveState: (key, state) => {
    (state ? storage.write(stateKey(key), JSON.stringify(state)) : storage.remove(stateKey(key))).catch((e) =>
      console.warn('Could not save sync state', e),
    );
  },
  keepReplaced,
  onStatus: (status) => useSync.setState(status),
  now: Date.now,
  newId,
});

useSync.setState({ ...sync.status(), replaced: readReplaced(activeProfile()) });
useProfiles.subscribe((state, prev) => {
  if (state.active !== prev.active) useSync.setState({ replaced: readReplaced(state.active) });
});

let sendTimer: ReturnType<typeof setTimeout> | null = null;

function sendSoon() {
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    sendTimer = null;
    sync.sync();
  }, SEND_AFTER_MS);
}

// Note what changes on this device, so the other devices can be told.
useStore.subscribe((state, prev) => {
  // Opening another profile puts different data on screen without changing any.
  if (isSwitching() || DATA_KEYS.every((k) => state[k] === prev[k])) return;
  const id = activeProfile();
  const changed = isReplacing() ? sync.localReplace(id) : sync.localChange(id, prev, state);
  if (changed) sendSoon();
});

onProfileChanges({
  added() {
    if (sync.profileAdded()) sendSoon();
  },
  removed(id) {
    storage.remove(replacedKey(id)).catch(() => {});
    if (sync.profileRemoved(id)) sendSoon();
  },
  replaced(id) {
    if (sync.localReplace(id)) sendSoon();
  },
});

let started = false;

/** Called once at launch. Does nothing at all unless sync was turned on. */
export function startSync() {
  if (started || !cloudSupported) return;
  started = true;
  let checking: ReturnType<typeof setInterval> | null = null;
  const watch = (active: boolean) => {
    if (checking) clearInterval(checking);
    checking = null;
    if (!active) return;
    checking = setInterval(() => {
      if (useSync.getState().on) sync.sync();
    }, CHECK_EVERY_MS);
  };
  if (useSync.getState().on) sync.sync();
  watch(AppState.currentState === 'active');
  AppState.addEventListener('change', (next) => {
    watch(next === 'active');
    if (!useSync.getState().on) return;
    // Coming back: catch up. Leaving: send anything not sent yet.
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = null;
    sync.sync();
  });
}

/** Before turning sync on: can iCloud be reached, and which profiles have data both there and here? */
export function lookAtCloud(): Promise<{ available: boolean; both: BothHave[] }> {
  return sync.look();
}

/** Turn sync on, keeping this device's data or iCloud's for the profiles where both have some. */
export async function turnOnSync(keep: 'device' | 'icloud'): Promise<void> {
  await flushSave();
  await sync.enable(keep);
}

/** Turn sync off on this device (its data stays), optionally deleting every copy from iCloud. */
export function turnOffSync(deleteFromCloud: boolean): Promise<void> {
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = null;
  return sync.disable(deleteFromCloud);
}

export function syncNow(): Promise<void> {
  return sync.sync();
}

export function dismissStopped() {
  sync.dismissStopped();
}

/**
 * Swap back to the open profile's data that was replaced. What's shown now is
 * kept in its place, so this can itself be undone. With sync on, the other
 * devices follow.
 */
export function bringBackReplaced(): boolean {
  const id = activeProfile();
  const saved = readJSON<{ data?: { version?: unknown } }>(replacedKey(id));
  const version = typeof saved?.data?.version === 'number' ? saved.data.version : DATA_VERSION;
  const data = saved ? checkedData(saved.data, version) : null;
  if (!data) return false;
  const current = currentData();
  useStore.getState().restore(data, null);
  keepReplaced(id, current, 'device');
  return true;
}
