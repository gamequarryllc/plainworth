import { cleanName } from './name';
import type { ID } from './types';

/**
 * Profiles: separate sets of accounts, spending and insights in one app, for
 * example one for yourself, one for a child and one for a business. Nothing is
 * shared between them except what belongs to the phone (the lock, Hide
 * Amounts, the reminder and the last backup).
 */
export interface Profile {
  id: ID;
  /** The same name as Settings › Name, kept here so the list can show it without opening the profile. */
  name: string;
  createdAt: number;
}

export interface ProfileList {
  /** The profile that's open. */
  active: ID;
  list: Profile[];
  /** Deleted profiles and when, so a person's other devices delete them too. */
  gone: Record<ID, number>;
}

/** The profile everyone starts with. It can be emptied but not deleted. */
export const MAIN: ID = 'main';

/** Plenty for a household, and few enough that the switcher stays a short menu. */
export const PROFILE_MAX = 10;

export function defaultProfiles(): ProfileList {
  return { active: MAIN, list: [{ id: MAIN, name: '', createdAt: 0 }], gone: {} };
}

const ID_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;
export const isProfileId = (v: unknown): v is ID => typeof v === 'string' && ID_SHAPE.test(v);

/** The first profile first, then in the order they were added. */
export function sortProfiles<T extends { id: ID; createdAt: number }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      Number(b.id === MAIN) - Number(a.id === MAIN) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** A saved list, checked: whatever was stored, the app always has the first profile and an open one. */
export function readProfileList(raw: unknown): ProfileList {
  const base = defaultProfiles();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProfileList>;
  const gone: Record<ID, number> = {};
  if (r.gone && typeof r.gone === 'object') {
    for (const [id, at] of Object.entries(r.gone)) {
      if (isProfileId(id) && id !== MAIN && typeof at === 'number' && Number.isFinite(at)) gone[id] = at;
    }
  }
  const seen = new Set<ID>();
  const list: Profile[] = [];
  for (const p of Array.isArray(r.list) ? r.list : []) {
    if (!p || typeof p !== 'object' || !isProfileId(p.id) || seen.has(p.id) || gone[p.id] !== undefined) continue;
    seen.add(p.id);
    list.push({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : '',
      createdAt: typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) ? p.createdAt : 0,
    });
  }
  if (!seen.has(MAIN)) list.push(base.list[0]);
  const sorted = sortProfiles(list);
  return { active: typeof r.active === 'string' && seen.has(r.active) ? r.active : MAIN, list: sorted, gone };
}

/** What a profile is called in lists: its name, or a stand-in until it has one. */
export function profileLabel(profile: Profile, list: Profile[]): string {
  const name = cleanName(profile.name);
  if (name) return name;
  if (profile.id === MAIN) return 'Personal';
  return `Profile ${sortProfiles(list).findIndex((p) => p.id === profile.id) + 1}`;
}
