import type { Account, Data, NWCategory, Settings, Snapshot, SpendCategory } from '@/lib/types';

/**
 * How two devices' copies of the data become one.
 *
 * Every item (an account, a balance entry, a category, one month's amount for
 * one category, a month's note, a setting) has a key and the time it last
 * changed. Merging keeps, for each key, whichever side changed it last.
 * Deleted items leave a marker with the time of the delete, so a delete on one
 * device isn't undone by the other device still having the item.
 *
 * Nothing here talks to iCloud or the app's store: it only works on plain data.
 */

/**
 * One line of history. Devices only merge copies from the same epoch. Replacing
 * everything (restoring a backup, erasing, choosing one device's data over
 * iCloud's) starts a new epoch, which other devices take whole.
 */
export interface Epoch {
  id: string;
  at: number;
}

export interface SyncMeta {
  epoch: Epoch;
  /** When each item last changed. Items not listed haven't changed since the epoch began. */
  stamps: Record<string, number>;
  /** Deleted items and when they were deleted. */
  tombs: Record<string, number>;
}

export interface Replica {
  data: Data;
  meta: SyncMeta;
}

/**
 * Settings that follow you to every device. The rest belong to the device:
 * its lock, hidden amounts, reminder, last backup, and how its lists and
 * charts are set.
 */
export const SYNCED_SETTINGS = ['currency', 'name', 'goal', 'birthYear', 'outlook', 'spendingGoal'] as const;
type SyncedSetting = (typeof SYNCED_SETTINGS)[number];

/** Is epoch `a` newer than `b`? */
export function newerEpoch(a: Epoch, b: Epoch): boolean {
  return a.at > b.at || (a.at === b.at && a.id > b.id);
}

export function newMeta(epoch: Epoch): SyncMeta {
  return { epoch, stamps: {}, tombs: {} };
}

/** The latest time anything in `meta` changed, so a device's clock never falls behind what it has seen. */
export function latestStamp(meta: SyncMeta): number {
  let latest = meta.epoch.at;
  for (const t of Object.values(meta.stamps)) if (t > latest) latest = t;
  for (const t of Object.values(meta.tombs)) if (t > latest) latest = t;
  return latest;
}

/** No accounts, balances, spending or notes: a fresh install (settings and the starting categories don't count). */
export function isEmpty(data: Data): boolean {
  return (
    data.accounts.length === 0 &&
    data.snapshots.length === 0 &&
    Object.keys(data.spend).length === 0 &&
    Object.keys(data.monthNotes).length === 0
  );
}

/** JSON with object keys in order, so the same content always gives the same text. */
export function canon(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(',')}}`;
}

/**
 * The kinds of item. A sticky kind can never come back once deleted (its ids
 * are never used twice), so a delete always wins over an edit made elsewhere.
 * For the others the same key can be filled in again, so the latest change wins.
 */
const KINDS = {
  nwCategory: { prefix: 'c:', sticky: true },
  account: { prefix: 'a:', sticky: true },
  snapshot: { prefix: 's:', sticky: true },
  spendCategory: { prefix: 'k:', sticky: true },
  spend: { prefix: 'm:', sticky: false },
  note: { prefix: 'n:', sticky: false },
  setting: { prefix: 'o:', sticky: false },
} as const;
type Kind = (typeof KINDS)[keyof typeof KINDS];

const KIND_ORDER: string[] = ['asset', 'liability'];
const GROUP_ORDER: string[] = ['recurring', 'variable', 'invest', 'income'];
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const byId = <T extends { id: string }>(items: T[]): Map<string, T> => new Map(items.map((i) => [i.id, i]));

function spendEntries(spend: Data['spend']): Map<string, number> {
  const out = new Map<string, number>();
  for (const [month, entries] of Object.entries(spend)) {
    for (const [categoryId, amount] of Object.entries(entries)) out.set(`${month}:${categoryId}`, amount);
  }
  return out;
}

function spendFromEntries(entries: Map<string, number>): Data['spend'] {
  const spend: Data['spend'] = {};
  for (const [key, amount] of entries) {
    const month = key.slice(0, 7);
    (spend[month] ??= {})[key.slice(8)] = amount;
  }
  return spend;
}

function syncedSettings(settings: Settings): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const field of SYNCED_SETTINGS) if (settings[field] !== undefined) out.set(field, settings[field]);
  return out;
}

/** `settings` with its synced fields replaced by `synced`; a field missing from `synced` is cleared. */
function withSynced(settings: Settings, synced: Map<string, unknown>): Settings {
  const next: Record<string, unknown> = { ...settings };
  for (const field of SYNCED_SETTINGS) {
    if (synced.has(field)) next[field] = synced.get(field);
    else delete next[field];
  }
  return next as unknown as Settings;
}

/** Only what syncs: the data with device-only settings left out. This is what goes in the iCloud file. */
export function syncedPart(data: Data): Data {
  const settings: Partial<Record<SyncedSetting, unknown>> = {};
  for (const field of SYNCED_SETTINGS) if (data.settings[field] !== undefined) settings[field] = data.settings[field];
  return { ...data, settings: settings as unknown as Settings };
}

/** Another device's whole copy, shown on this device: its data with this device's own settings kept. */
export function adopt(local: Data, incoming: Data): Data {
  return {
    ...incoming,
    settings: withSynced(local.settings, syncedSettings(incoming.settings)),
  };
}

// ---------------------------------------------------------------------------
// Noting local changes
// ---------------------------------------------------------------------------

function stampMap(
  kind: Kind,
  prev: Map<string, unknown>,
  next: Map<string, unknown>,
  meta: SyncMeta,
  now: number,
): boolean {
  let changed = false;
  for (const [id, value] of next) {
    const before = prev.get(id);
    if (before === value) continue;
    if (before !== undefined && canon(before) === canon(value)) continue;
    meta.stamps[kind.prefix + id] = now;
    delete meta.tombs[kind.prefix + id];
    changed = true;
  }
  for (const id of prev.keys()) {
    if (next.has(id)) continue;
    meta.tombs[kind.prefix + id] = now;
    delete meta.stamps[kind.prefix + id];
    changed = true;
  }
  return changed;
}

/**
 * After the data changed on this device from `prev` to `next`: the sync record
 * with every changed item marked as changed at `now`, and every removed item
 * marked deleted. Null if nothing that syncs changed.
 */
export function stampChanges(prev: Data, next: Data, meta: SyncMeta, now: number): SyncMeta | null {
  const out: SyncMeta = {
    epoch: meta.epoch,
    stamps: { ...meta.stamps },
    tombs: { ...meta.tombs },
  };
  let changed = false;
  if (prev.nwCategories !== next.nwCategories) {
    changed = stampMap(KINDS.nwCategory, byId(prev.nwCategories), byId(next.nwCategories), out, now) || changed;
  }
  if (prev.accounts !== next.accounts) {
    changed = stampMap(KINDS.account, byId(prev.accounts), byId(next.accounts), out, now) || changed;
  }
  if (prev.snapshots !== next.snapshots) {
    changed = stampMap(KINDS.snapshot, byId(prev.snapshots), byId(next.snapshots), out, now) || changed;
  }
  if (prev.spendCategories !== next.spendCategories) {
    changed =
      stampMap(KINDS.spendCategory, byId(prev.spendCategories), byId(next.spendCategories), out, now) || changed;
  }
  if (prev.spend !== next.spend) {
    changed = stampMap(KINDS.spend, spendEntries(prev.spend), spendEntries(next.spend), out, now) || changed;
  }
  if (prev.monthNotes !== next.monthNotes) {
    changed =
      stampMap(
        KINDS.note,
        new Map(Object.entries(prev.monthNotes)),
        new Map(Object.entries(next.monthNotes)),
        out,
        now,
      ) || changed;
  }
  if (prev.settings !== next.settings) {
    changed =
      stampMap(KINDS.setting, syncedSettings(prev.settings), syncedSettings(next.settings), out, now) || changed;
  }
  return changed ? out : null;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

interface MergeContext {
  local: SyncMeta;
  remote: SyncMeta;
  /** The merged record, filled in as each kind is merged. */
  stamps: Record<string, number>;
  tombs: Record<string, number>;
}

const stampOf = (meta: SyncMeta, key: string): number => meta.stamps[key] ?? meta.epoch.at;

function mergeMap<T>(kind: Kind, local: Map<string, T>, remote: Map<string, T>, ctx: MergeContext): Map<string, T> {
  const out = new Map<string, T>();
  const keep = (id: string, value: T, stamp: number) => {
    out.set(id, value);
    if (stamp > ctx.local.epoch.at) ctx.stamps[kind.prefix + id] = stamp;
  };
  const bury = (id: string, at: number) => {
    ctx.tombs[kind.prefix + id] = at;
  };

  for (const [id, mine] of local) {
    const key = kind.prefix + id;
    const myStamp = stampOf(ctx.local, key);
    const theirTomb = ctx.remote.tombs[key];
    if (remote.has(id)) {
      const theirs = remote.get(id) as T;
      const theirStamp = stampOf(ctx.remote, key);
      if (theirStamp < myStamp) {
        keep(id, mine, myStamp);
        continue;
      }
      const a = canon(mine);
      const b = canon(theirs);
      // Changed at the very same moment on both: pick the same one on every device.
      if (a === b || (theirStamp === myStamp && a > b)) {
        keep(id, mine, theirStamp);
      } else {
        keep(id, theirs, theirStamp);
      }
    } else if (theirTomb !== undefined && (kind.sticky || theirTomb >= myStamp)) {
      bury(id, theirTomb);
    } else {
      keep(id, mine, myStamp);
    }
  }

  for (const [id, theirs] of remote) {
    if (local.has(id)) continue;
    const key = kind.prefix + id;
    const theirStamp = stampOf(ctx.remote, key);
    const myTomb = ctx.local.tombs[key];
    if (myTomb !== undefined && (kind.sticky || myTomb >= theirStamp)) {
      bury(id, myTomb);
    } else {
      keep(id, theirs, theirStamp);
    }
  }
  return out;
}

/** Carry over delete markers for items neither side has any more. */
function mergeTombs(ctx: MergeContext, live: Set<string>) {
  for (const meta of [ctx.local, ctx.remote]) {
    for (const [key, at] of Object.entries(meta.tombs)) {
      if (live.has(key)) continue;
      if (ctx.tombs[key] === undefined || at > ctx.tombs[key]) ctx.tombs[key] = at;
    }
  }
}

export interface MergeResult extends Replica {
  /** False when the remote copy had nothing new for this device. */
  changed: boolean;
}

/**
 * Bring another device's copy (`remote`) into this device's (`local`). Both
 * must be from the same epoch. Merging the same copy twice changes nothing,
 * and two devices that merge each other's copies end up identical.
 */
export function merge(local: Replica, remote: Replica): MergeResult {
  const ctx: MergeContext = {
    local: local.meta,
    remote: remote.meta,
    stamps: {},
    tombs: {},
  };

  const nwCategories = mergeMap(KINDS.nwCategory, byId(local.data.nwCategories), byId(remote.data.nwCategories), ctx);
  const accounts = mergeMap(KINDS.account, byId(local.data.accounts), byId(remote.data.accounts), ctx);
  const snapshots = mergeMap(KINDS.snapshot, byId(local.data.snapshots), byId(remote.data.snapshots), ctx);
  const spendCategories = mergeMap(
    KINDS.spendCategory,
    byId(local.data.spendCategories),
    byId(remote.data.spendCategories),
    ctx,
  );
  const spend = mergeMap(KINDS.spend, spendEntries(local.data.spend), spendEntries(remote.data.spend), ctx);
  const notes = mergeMap(
    KINDS.note,
    new Map(Object.entries(local.data.monthNotes)),
    new Map(Object.entries(remote.data.monthNotes)),
    ctx,
  );
  const settings = mergeMap(
    KINDS.setting,
    syncedSettings(local.data.settings),
    syncedSettings(remote.data.settings),
    ctx,
  );

  tidy({ nwCategories, accounts, snapshots, spendCategories, spend }, local, remote, ctx);

  const live = new Set<string>();
  const add = (kind: Kind, map: Map<string, unknown>) => {
    for (const id of map.keys()) live.add(kind.prefix + id);
  };
  add(KINDS.nwCategory, nwCategories);
  add(KINDS.account, accounts);
  add(KINDS.snapshot, snapshots);
  add(KINDS.spendCategory, spendCategories);
  add(KINDS.spend, spend);
  add(KINDS.note, notes);
  add(KINDS.setting, settings);
  for (const key of Object.keys(ctx.stamps)) if (!live.has(key)) delete ctx.stamps[key];
  for (const key of Object.keys(ctx.tombs)) if (live.has(key)) delete ctx.tombs[key];
  mergeTombs(ctx, live);

  const data: Data = {
    version: local.data.version,
    // In a set order, so every device ends up with the very same lists.
    nwCategories: [...nwCategories.values()].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.order - b.order || byText(a.id, b.id),
    ),
    accounts: [...accounts.values()].sort((a, b) => a.createdAt - b.createdAt || byText(a.id, b.id)),
    snapshots: [...snapshots.values()].sort((a, b) => a.createdAt - b.createdAt || byText(a.id, b.id)),
    spendCategories: [...spendCategories.values()].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order || byText(a.id, b.id),
    ),
    spend: spendFromEntries(spend),
    monthNotes: Object.fromEntries(notes),
    settings: withSynced(local.data.settings, settings),
  };
  const changed =
    canon(ctx.stamps) !== canon(local.meta.stamps) ||
    canon(ctx.tombs) !== canon(local.meta.tombs) ||
    canon(syncedPart(data)) !== canon(syncedPart(local.data));
  return {
    data,
    meta: { epoch: local.meta.epoch, stamps: ctx.stamps, tombs: ctx.tombs },
    changed,
  };
}

/**
 * Fix what merging item by item can leave behind when two devices did
 * conflicting things at once. Each fix depends only on the merged result, so
 * every device makes the same one.
 */
function tidy(
  d: {
    nwCategories: Map<string, NWCategory>;
    accounts: Map<string, Account>;
    snapshots: Map<string, Snapshot>;
    spendCategories: Map<string, SpendCategory>;
    spend: Map<string, number>;
  },
  local: Replica,
  remote: Replica,
  ctx: MergeContext,
) {
  // An account added on one device to a category deleted on the other: the category stays.
  for (const account of d.accounts.values()) {
    if (d.nwCategories.has(account.categoryId)) continue;
    const key = KINDS.nwCategory.prefix + account.categoryId;
    const mine = local.data.nwCategories.find((c) => c.id === account.categoryId);
    const theirs = remote.data.nwCategories.find((c) => c.id === account.categoryId);
    const category = mine ?? theirs;
    if (category) {
      // Stamped after the delete, and the same on every device that works this out.
      const deleted = ctx.tombs[key] ?? 0;
      const kept = Math.max(mine ? stampOf(local.meta, key) : 0, theirs ? stampOf(remote.meta, key) : 0);
      const stamp = kept > deleted ? kept : deleted + 1;
      d.nwCategories.set(category.id, category);
      ctx.stamps[key] = stamp;
      delete ctx.tombs[key];
      continue;
    }
    // Nobody has the category any more: put the account in the first one of the list.
    const first = [...d.nwCategories.values()].sort((a, b) => a.order - b.order || byText(a.id, b.id))[0];
    if (first) {
      const accountKey = KINDS.account.prefix + account.id;
      d.accounts.set(account.id, { ...account, categoryId: first.id });
      ctx.stamps[accountKey] = Math.max(stampOf(local.meta, accountKey), stampOf(remote.meta, accountKey)) + 1;
    }
  }

  // A balance added on one device to an account deleted on the other goes with the account.
  for (const snap of d.snapshots.values()) {
    if (d.accounts.has(snap.accountId)) continue;
    d.snapshots.delete(snap.id);
    ctx.tombs[KINDS.snapshot.prefix + snap.id] =
      ctx.tombs[KINDS.account.prefix + snap.accountId] ?? stampOf(local.meta, KINDS.snapshot.prefix + snap.id);
  }

  // An amount entered on one device for a spending category deleted on the other goes with the category.
  for (const key of d.spend.keys()) {
    const categoryId = key.slice(8);
    if (d.spendCategories.has(categoryId)) continue;
    d.spend.delete(key);
    ctx.tombs[KINDS.spend.prefix + key] =
      ctx.tombs[KINDS.spendCategory.prefix + categoryId] ?? stampOf(local.meta, KINDS.spend.prefix + key);
  }

  // Both devices fetched today's metal price before syncing: one automatic entry a day is enough.
  const spot = new Map<string, Snapshot>();
  for (const snap of d.snapshots.values()) {
    if (snap.source !== 'spot') continue;
    const slot = `${snap.accountId}:${snap.date}`;
    const kept = spot.get(slot);
    if (!kept) {
      spot.set(slot, snap);
      continue;
    }
    const newer = snap.createdAt > kept.createdAt || (snap.createdAt === kept.createdAt && snap.id > kept.id);
    const drop = newer ? kept : snap;
    if (newer) spot.set(slot, snap);
    d.snapshots.delete(drop.id);
    const dropKey = KINDS.snapshot.prefix + drop.id;
    ctx.tombs[dropKey] = Math.max(stampOf(local.meta, dropKey), stampOf(remote.meta, dropKey));
  }
}
