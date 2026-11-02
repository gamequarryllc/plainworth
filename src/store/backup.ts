import type { Data, DateKey } from '@/lib/types';

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
  data: Data;
}

export function backupFileName(today: DateKey): string {
  return `Plainworth Backup ${today}.plainworth`;
}

export function makeBackup(data: Data, today: DateKey): string {
  const file: BackupFile = { app: 'Plainworth', version: DATA_VERSION, date: today, data: { ...data, version: DATA_VERSION } };
  return JSON.stringify(file);
}

/** A file that can't be restored; the message says why, for the person. */
export class BackupError extends Error {}

export interface Backup {
  data: Data;
  /** When it was made, if the file says. */
  date: DateKey | null;
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
  if (!looksRight(file.data)) {
    throw new BackupError('This backup is damaged or incomplete, so nothing was changed.');
  }
  return {
    data: migrate({ ...file.data, version }),
    date: typeof file.date === 'string' && DATE.test(file.date) ? file.date : null,
  };
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
