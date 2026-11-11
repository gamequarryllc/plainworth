import { AppState } from 'react-native';
import { create } from 'zustand';

import { newId } from '@/lib/id';
import { storage } from '@/lib/storage';
import { cloudFolder, cloudSupported } from '@/lib/sync/cloud';
import { createSync, type CloudCopy, type SyncState, type SyncStatus } from '@/lib/sync/engine';
import type { Data } from '@/lib/types';

import { checkedData } from './backup';
import { DATA_VERSION } from './defaults';
import { currentData, DATA_KEYS, flushSave, isReplacing, useStore } from './index';

/**
 * Sync with iCloud, off unless the person turns it on in Settings.
 *
 * While it's off, nothing here touches iCloud: no reads, no writes, no checks.
 * Turned on, each change is saved on the phone first, exactly as without sync,
 * and then sent to the person's own private iCloud so their other devices can
 * pick it up. How devices' copies are merged is in `src/lib/sync`.
 */

export { cloudSupported };

const STATE_KEY = 'tally.sync';
/** The data that turning sync on (or another device) last replaced, kept in case that was the wrong call. */
const REPLACED_KEY = 'tally.sync.replaced';

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

function readReplaced(): Replaced | null {
  const saved = readJSON<Replaced>(REPLACED_KEY);
  return saved && typeof saved.at === 'number'
    ? { at: saved.at, from: saved.from === 'icloud' ? 'icloud' : 'device' }
    : null;
}

export const useSync = create<SyncStore>(() => ({ on: false, busy: false, replaced: null }));

function keepReplaced(data: Data, from: Replaced['from']) {
  const at = Date.now();
  storage.write(REPLACED_KEY, JSON.stringify({ at, from, data })).catch(() => {});
  useSync.setState({ replaced: { at, from } });
}

const sync = createSync({
  cloud: cloudFolder,
  dataVersion: DATA_VERSION,
  getData: currentData,
  setData: (data) => useStore.setState(data),
  readData: checkedData,
  loadState: () => {
    const state = readJSON<SyncState>(STATE_KEY);
    return state && typeof state.deviceId === 'string' && typeof state.epoch?.id === 'string' ? state : null;
  },
  saveState: (state) => {
    (state ? storage.write(STATE_KEY, JSON.stringify(state)) : storage.remove(STATE_KEY)).catch((e) =>
      console.warn('Could not save sync state', e),
    );
  },
  keepReplaced,
  onStatus: (status) => useSync.setState(status),
  now: Date.now,
  newId,
});

useSync.setState({ ...sync.status(), replaced: readReplaced() });

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
  if (DATA_KEYS.every((k) => state[k] === prev[k])) return;
  const changed = isReplacing() ? sync.localReplace() : sync.localChange(prev, state);
  if (changed) sendSoon();
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

/** Before turning sync on: can iCloud be reached, and does it already hold data? */
export function lookAtCloud(): Promise<{ available: boolean; cloud: CloudCopy | null }> {
  return sync.look();
}

/** Turn sync on, keeping this device's data or iCloud's where both have some. */
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
 * Swap back to the data that was replaced. What's shown now is kept in its
 * place, so this can itself be undone. With sync on, the other devices follow.
 */
export function bringBackReplaced(): boolean {
  const saved = readJSON<{ data?: { version?: unknown } }>(REPLACED_KEY);
  const version = typeof saved?.data?.version === 'number' ? saved.data.version : DATA_VERSION;
  const data = saved ? checkedData(saved.data, version) : null;
  if (!data) return false;
  const current = currentData();
  useStore.getState().restore(data, null);
  keepReplaced(current, 'device');
  return true;
}
