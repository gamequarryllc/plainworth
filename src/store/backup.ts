import { isProfileId, MAIN } from '@/lib/profiles';
import type { Data, DateKey, ID } from '@/lib/types';

import { DATA_VERSION } from './defaults';
import { migrate } from './migrate';

/**
 * A backup file: everything in Plainworth, labeled with the version of its format
 * so any later version of the app can still read it. Unlike the Excel export,
 * it's meant to be restored, not opened or edited.
 */
interface BackupFile {
  /** Backups made while the app was still called Tally say Tally. */
  app: 'Plainworth' | 'Tally';
  /** Format version of `data`. Older ones are brought up to date when restored. */
  version: number;
  /** The day it was made. */
  date: DateKey;
  /** The profile that was open. Versions before profiles read only this. */
  data: Data;
  /** Which profile `data` is. Missing in backups made before profiles. */
  profile?: { id: ID; createdAt: number };
  /** Every other profile. */
  others?: BackupProfile[];
}

/** One profile's data inside a backup. */
export interface BackupProfile {
  id: ID;
  createdAt: number;
  data: Data;
}

export function backupFileName(today: DateKey): string {
  return `Plainworth Backup ${today}.plainworth`;
}

/**
 * `profiles` is every profile with the open one first. Left out (as in tests
 * of a single set of data), the file is one profile's worth, like backups
 * made before profiles.
 */
export function makeBackup(data: Data, today: DateKey, profiles?: BackupProfile[]): string {
  const stamp = (d: Data): Data => ({ ...d, version: DATA_VERSION });
  const file: BackupFile = { app: 'Plainworth', version: DATA_VERSION, date: today, data: stamp(data) };
  if (profiles?.length) {
    const [open, ...others] = profiles;
    file.data = stamp(open.data);
    file.profile = { id: open.id, createdAt: open.createdAt };
    file.others = others.map((p) => ({ id: p.id, createdAt: p.createdAt, data: stamp(p.data) }));
  }
  return JSON.stringify(file);
}

/** A file that can't be restored; the message says why, for the person. */
export class BackupError extends Error {}

export interface Backup {
  /** The profile that was open when it was made. */
  data: Data;
  /** When it was made, if the file says. */
  date: DateKey | null;
  /**
   * Every profile, the open one first, when the file holds them all. Null for
   * a backup made before profiles, which is one profile's data and restores
   * into whichever profile is open.
   */
  profiles: BackupProfile[] | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read a backup file's text, checking it thoroughly: a bad file must never replace good data. */
export function readBackup(text: string): Backup {
  let file: Partial<BackupFile> | null = null;
  try {
    file = JSON.parse(text);
  } catch {
    // Handled below.
  }
  if (!file || (file.app !== 'Plainworth' && file.app !== 'Tally') || typeof file.data !== 'object' || !file.data) {
    throw new BackupError(
      'This file isn’t a Plainworth backup. Choose a file named like “Plainworth Backup 2026-11-01.plainworth”.',
    );
  }
  const version = typeof file.version === 'number' ? file.version : 1;
  if (version > DATA_VERSION) {
    throw new BackupError('This backup was made by a newer version of Plainworth. Update the app, then try again.');
  }
  const damaged = () => new BackupError('This backup is damaged or incomplete, so nothing was changed.');
  const data = checkedData(file.data, version);
  if (!data) throw damaged();
  let profiles: BackupProfile[] | null = null;
  if (isRecord(file.profile)) {
    const createdAt = (v: unknown) => (isNumber(v) ? v : 0);
    profiles = [{ id: isProfileId(file.profile.id) ? file.profile.id : MAIN, createdAt: createdAt(file.profile.createdAt), data }];
    const seen = new Set([profiles[0].id]);
    for (const other of Array.isArray(file.others) ? (file.others as unknown[]) : []) {
      // One unreadable profile spoils the file: restoring the rest would quietly lose it.
      if (!isRecord(other) || !isProfileId(other.id) || seen.has(other.id)) throw damaged();
      const otherData = checkedData(other.data, version);
      if (!otherData) throw damaged();
      seen.add(other.id);
      profiles.push({ id: other.id, createdAt: createdAt(other.createdAt), data: otherData });
    }
  }
  return { data, date: typeof file.date === 'string' && DATE.test(file.date) ? file.date : null, profiles };
}

/**
 * Data that came from outside the app (a backup file, or another device through
 * iCloud), checked and brought up to date. Null if any part isn't the shape the
 * app expects, or it's from a newer version than this one.
 */
export function checkedData(raw: unknown, version: number): Data | null {
  if (!isRecord(raw) || version > DATA_VERSION || !looksRight(raw as Partial<Data>)) return null;
  return migrate({ ...raw, version });
}

/** "12 accounts and 22 months of spending". Several profiles' worth are added up. */
export function contents(...all: Data[]): string {
  const accounts = all.reduce((n, data) => n + data.accounts.length, 0);
  const months = all.reduce(
    (n, data) => n + Object.values(data.spend).filter((m) => Object.values(m).some(Boolean)).length,
    0,
  );
  const parts = [
    accounts ? `${accounts} ${accounts === 1 ? 'account' : 'accounts'}` : '',
    months ? `${months} ${months === 1 ? 'month' : 'months'} of spending` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : 'nothing in it yet';
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const listOf = (v: unknown, ok: (item: Record<string, unknown>) => boolean) =>
  v === undefined || (Array.isArray(v) && v.every((item) => isRecord(item) && ok(item)));

/** Every part the app reads has the shape it expects, so a restore can't leave Plainworth unable to open. */
function looksRight(d: Partial<Data>): boolean {
  return (
    Array.isArray(d.accounts) &&
    Array.isArray(d.snapshots) &&
    listOf(d.accounts, (a) => isString(a.id) && isString(a.name) && isString(a.categoryId)) &&
    listOf(d.snapshots, (s) => isString(s.id) && isString(s.accountId) && isString(s.date) && DATE.test(s.date) && isNumber(s.value)) &&
    listOf(d.nwCategories, (c) => isString(c.id) && isString(c.name) && (c.kind === 'asset' || c.kind === 'liability')) &&
    listOf(d.spendCategories, (c) => isString(c.id) && isString(c.name) && isString(c.group)) &&
    (d.spend === undefined ||
      (isRecord(d.spend) && Object.values(d.spend).every((m) => isRecord(m) && Object.values(m).every(isNumber)))) &&
    (d.monthNotes === undefined || (isRecord(d.monthNotes) && Object.values(d.monthNotes).every(isString))) &&
    (d.settings === undefined || isRecord(d.settings))
  );
}
