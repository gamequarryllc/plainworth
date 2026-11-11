import { newId } from '@/lib/id';
import { cleanName } from '@/lib/name';
import { MAIN, PROFILE_MAX, sortProfiles, type Profile } from '@/lib/profiles';
import { storage } from '@/lib/storage';
import type { Data, ID, Settings } from '@/lib/types';

import type { Backup, BackupProfile } from './backup';
import { defaultSettings, emptyData } from './defaults';
import { currentData, flushSave, loadData, showProfileData, useStore } from './index';
import { activeProfile, dataKey, saveProfileList, useProfiles } from './profile-list';

/**
 * Adding, switching and deleting profiles. The data store holds the open
 * profile's data; the others are read from storage when first needed and kept
 * here until they're opened.
 */

const resting = new Map<ID, Data>();

/** What sync needs to hear about. */
interface Listener {
  added(id: ID): void;
  removed(id: ID): void;
  /** A profile that isn't open had everything replaced (a backup restored). */
  replaced(id: ID): void;
}
let listener: Listener | null = null;
export function onProfileChanges(l: Listener) {
  listener = l;
}

const exists = (id: ID) => useProfiles.getState().list.some((p) => p.id === id);

/** Any profile's data, open or not. */
export function profileData(id: ID): Data {
  if (id === activeProfile()) return currentData();
  let data = resting.get(id);
  if (!data) {
    data = loadData(dataKey(id));
    resting.set(id, data);
  }
  return data;
}

function saveResting(id: ID, data: Data) {
  resting.set(id, data);
  storage.write(dataKey(id), JSON.stringify(data)).catch((e) => console.warn('Could not save a profile', e));
  noteName(id, data.settings.name);
}

/** Put this data in a profile: on screen if it's the open one, otherwise straight to storage. */
export function setProfileData(id: ID, data: Data) {
  if (id === activeProfile()) useStore.setState(data);
  else if (exists(id)) saveResting(id, data);
}

/** Keep the list's copy of a profile's name in step with the name in its settings. */
function noteName(id: ID, raw: string | undefined) {
  const name = cleanName(raw);
  const { list } = useProfiles.getState();
  if (list.some((p) => p.id === id && p.name !== name)) {
    saveProfileList({ list: list.map((p) => (p.id === id ? { ...p, name } : p)) });
  }
}

useStore.subscribe((state, prev) => {
  if (state.settings.name !== prev.settings.name) noteName(activeProfile(), state.settings.name);
});

/** The lock, Hide Amounts, the reminder and the last backup belong to the phone, so they follow it from profile to profile. */
function withPhoneSettings(data: Data, from: Settings): Data {
  const { requireUnlock, hideAmounts, reminder, lastBackup } = from;
  return { ...data, settings: { ...data.settings, requireUnlock, hideAmounts, reminder, lastBackup } };
}

export function switchProfile(id: ID) {
  const from = activeProfile();
  if (id === from || !exists(id)) return;
  // Anything waiting to be saved goes to the profile it belongs to first.
  flushSave();
  const leaving = currentData();
  const next = withPhoneSettings(profileData(id), leaving.settings);
  resting.set(from, leaving);
  resting.delete(id);
  saveProfileList({ active: id });
  showProfileData(next);
}

export const canAddProfile = () => useProfiles.getState().list.length < PROFILE_MAX;

/**
 * Add a profile. `id`, `createdAt` and `data` are for one that already exists
 * somewhere: in a backup, or on another of the person's devices (`elsewhere`).
 */
export function addProfile(input: { name?: string; id?: ID; createdAt?: number; data?: Data; elsewhere?: boolean }): ID {
  const { list, gone } = useProfiles.getState();
  const id = input.id && !exists(input.id) && gone[input.id] === undefined ? input.id : newId();
  const name = cleanName(input.name ?? input.data?.settings.name);
  // Starts with the same currency as the profile it was added from.
  const data: Data = input.data ?? {
    ...emptyData(),
    settings: { ...defaultSettings(), currency: useStore.getState().settings.currency, name },
  };
  const profile: Profile = { id, name, createdAt: input.createdAt ?? Date.now() };
  saveProfileList({ list: sortProfiles([...list, profile]) });
  saveResting(id, data);
  if (!input.elsewhere) listener?.added(id);
  return id;
}

/** Delete a profile and everything in it. The first profile stays; erase its data instead. */
export function deleteProfile(id: ID, opts: { at?: number; elsewhere?: boolean } = {}) {
  if (id === MAIN) return;
  const had = exists(id);
  if (had && id === activeProfile()) switchProfile(MAIN);
  const { list, gone } = useProfiles.getState();
  saveProfileList({ list: list.filter((p) => p.id !== id), gone: { ...gone, [id]: opts.at ?? Date.now() } });
  resting.delete(id);
  if (!had) return;
  storage.remove(dataKey(id)).catch(() => {});
  if (!opts.elsewhere) listener?.removed(id);
}

/** Every profile's data, the open one first: what a backup holds. */
export function allProfiles(): BackupProfile[] {
  const { list, active } = useProfiles.getState();
  return [...list]
    .sort((a, b) => Number(b.id === active) - Number(a.id === active))
    .map((p) => ({ id: p.id, createdAt: p.createdAt, data: profileData(p.id) }));
}

/**
 * Restore a backup. One made before profiles is a single set of data and
 * replaces the open profile. One that holds every profile replaces them all:
 * profiles it doesn't have are deleted, the rest are put back as they were.
 */
export function restoreBackup(backup: Backup) {
  const restore = useStore.getState().restore;
  if (!backup.profiles) {
    restore(backup.data, backup.date);
    return;
  }
  const kept = new Set(backup.profiles.map((p) => p.id));
  for (const p of useProfiles.getState().list) {
    if (p.id !== MAIN && !kept.has(p.id)) deleteProfile(p.id);
  }
  for (const p of backup.profiles) {
    if (!exists(p.id)) addProfile({ id: p.id, createdAt: p.createdAt, data: p.data });
    else if (p.id === activeProfile()) restore(p.data, backup.date);
    else {
      saveResting(p.id, p.data);
      listener?.replaced(p.id);
    }
  }
  // A backup from before a profile was the first one has nothing for it.
  if (!kept.has(MAIN)) {
    if (activeProfile() === MAIN) restore(emptyData(), backup.date);
    else {
      saveResting(MAIN, emptyData());
      listener?.replaced(MAIN);
    }
  }
}

/** Erase All Data: every other profile is deleted and the first one is emptied. */
export function eraseEverything() {
  switchProfile(MAIN);
  for (const p of useProfiles.getState().list) deleteProfile(p.id);
  useStore.getState().eraseAll();
}
