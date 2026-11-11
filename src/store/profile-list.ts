import { create } from 'zustand';

import { MAIN, readProfileList, type ProfileList } from '@/lib/profiles';
import { storage } from '@/lib/storage';
import type { ID } from '@/lib/types';

/**
 * Which profiles there are and which one is open. Kept apart from the data
 * store, which only ever holds the open profile's data: the others stay in
 * storage until they're switched to. What can be done with profiles is in
 * `profiles.ts`.
 */

const LIST_KEY = 'tally.profiles';

function load(): ProfileList {
  try {
    const raw = storage.read(LIST_KEY);
    return readProfileList(raw ? JSON.parse(raw) : null);
  } catch {
    return readProfileList(null);
  }
}

export const useProfiles = create<ProfileList>(() => load());

export function saveProfileList(patch: Partial<ProfileList>) {
  useProfiles.setState(patch);
  storage
    .write(LIST_KEY, JSON.stringify(useProfiles.getState()))
    .catch((e) => console.warn('Could not save the profile list', e));
}

export const activeProfile = (): ID => useProfiles.getState().active;

/** Where a profile's data is saved. The first profile keeps the key the app has always used. */
export const dataKey = (id: ID): string => (id === MAIN ? 'tally.data' : `tally.data.p.${id}`);
