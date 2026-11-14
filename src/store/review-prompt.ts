import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

import { storage } from '@/lib/storage';

/**
 * Apple's own "Enjoying Plainworth?" rating prompt (StoreKit requestReview),
 * asked at most once per app version: right after the person saves their 3rd
 * balance update of that version. Never on the first launch, never while
 * adding accounts (that's setup), never behind a button, never for anything
 * in return. iOS decides whether it actually shows (at most 3 times a year)
 * and never shows it in TestFlight.
 *
 * Kept on this phone only, apart from the user's data, like the other prompts.
 */
const KEY = 'plainworth.review';
/** Set on the first launch, so that launch can be told apart from later ones. */
const LAUNCHED = 'plainworth.launched';
const UPDATES_BEFORE_ASKING = 3;

interface ReviewState {
  /** The app version the count belongs to. A new version starts again from 0. */
  version: string;
  /** Balance updates saved in this version. */
  updates: number;
  /** True once this version has asked. */
  asked: boolean;
}

const version = Constants.expoConfig?.version ?? '';

/** True while this is the very first time the app has been opened on this phone. */
let firstLaunch = true;

/** Called once at launch (root layout). */
export function noteLaunch() {
  try {
    firstLaunch = storage.read(LAUNCHED) == null;
    if (firstLaunch) storage.write(LAUNCHED, String(Date.now())).catch(() => {});
  } catch {
    firstLaunch = true;
  }
}

function read(): ReviewState {
  const fresh = { version, updates: 0, asked: false };
  try {
    const saved = JSON.parse(storage.read(KEY) ?? 'null') as ReviewState | null;
    return saved && saved.version === version ? saved : fresh;
  } catch {
    return fresh;
  }
}

/**
 * Call after a balance update is saved (one account or Update Balances).
 * `busy` is true when another question is about to show for this same save
 * (the reminder offer): the rating prompt then waits for the next save.
 */
export function balanceUpdateSaved({ busy = false }: { busy?: boolean } = {}) {
  if (Platform.OS !== 'ios') return;
  const state = read();
  if (state.asked) return;
  const next = { ...state, updates: state.updates + 1 };
  const ask = next.updates >= UPDATES_BEFORE_ASKING && !firstLaunch && !busy;
  if (ask) next.asked = true;
  storage.write(KEY, JSON.stringify(next)).catch(() => {});
  if (!ask) return;
  // Wait for the update sheet to finish closing.
  setTimeout(async () => {
    try {
      if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
    } catch {
      // Not available on this phone: nothing to do.
    }
  }, 800);
}
