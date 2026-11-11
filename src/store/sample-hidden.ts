import { create } from 'zustand';

import { storage } from '@/lib/storage';

import { currentData } from './index';

/**
 * Whether the first-open sample previews are off on this phone ('off') or
 * still showing ('on'). Kept apart from the app's data, so it's never part of
 * a backup or a sync.
 */
const KEY = 'plainworth.sample';

function readHidden(): boolean {
  let saved: string | null;
  try {
    saved = storage.read(KEY);
  } catch {
    return true;
  }
  if (saved != null) return saved !== 'on';
  // First open with previews in the app. Someone already using Plainworth
  // never sees one; on a fresh install they stay until hidden.
  const data = currentData();
  const inUse = data.accounts.length > 0 || Object.keys(data.spend).length > 0;
  storage.write(KEY, inUse ? 'off' : 'on').catch(() => {});
  return inUse;
}

const useHidden = create(() => ({ hidden: readHidden() }));

/** True until the previews are hidden. Each page also drops its own once it has real data. */
export function useSampleOn(): boolean {
  return !useHidden((s) => s.hidden);
}

export function hideSample() {
  useHidden.setState({ hidden: true });
  storage.write(KEY, 'off').catch(() => {});
}

/** For seeing the previews again in development. */
export function resetSample() {
  useHidden.setState({ hidden: false });
  storage.write(KEY, 'on').catch(() => {});
}
