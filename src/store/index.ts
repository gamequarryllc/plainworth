import { createContext, useContext } from 'react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { shiftMonth } from '@/lib/dates';
import { newId } from '@/lib/id';
import { spotUpdates } from '@/lib/metals';
import { compareSnapshots } from '@/lib/networth';
import { placeInOrder } from '@/lib/order';
import { storage } from '@/lib/storage';
import type {
  Account,
  Cents,
  Data,
  DateKey,
  ID,
  Metal,
  MonthKey,
  NWCategory,
  Settings,
  Snapshot,
  SpendCategory,
} from '@/lib/types';

import { DATA_VERSION, emptyData } from './defaults';
import { migrate } from './migrate';
import { activeProfile, dataKey } from './profile-list';
import { sampleData } from './sample';
import { DECADE, decadeSampleData } from './sample-decade';

export interface NewSnapshot {
  accountId: ID;
  value: Cents;
  date: DateKey;
  quantity?: number;
  unitPrice?: Cents;
  note?: string;
  source?: Snapshot['source'];
}

interface Actions {
  addAccount(input: {
    name: string;
    categoryId: ID;
    unit?: string;
    metal?: Metal;
    apr?: number;
    initial?: Omit<NewSnapshot, 'accountId'>;
  }): ID;
  updateAccount(id: ID, patch: Partial<Omit<Account, 'id'>>): void;
  deleteAccount(id: ID): void;
  closeAccount(id: ID, date: DateKey): void;
  reopenAccount(id: ID): void;

  addSnapshots(entries: NewSnapshot[]): void;
  updateSnapshot(id: ID, patch: Partial<Omit<Snapshot, 'id' | 'accountId'>>): void;
  deleteSnapshot(id: ID): void;
  /** Bring metal accounts to fresh prices (per troy ounce). Returns how many entries changed. */
  applySpotPrices(prices: Partial<Record<Metal, Cents>>, today: DateKey): number;

  addNWCategory(input: Pick<NWCategory, 'name' | 'kind'>): ID;
  updateNWCategory(id: ID, patch: Partial<Pick<NWCategory, 'name' | 'kind'>>): void;
  deleteNWCategory(id: ID): void;
  moveNWCategory(id: ID, direction: -1 | 1): void;

  setSpend(month: MonthKey, categoryId: ID, amount: Cents | null): void;
  /** Copy last month's recurring amounts into empty recurring fields. Returns how many were filled. */
  fillRecurring(month: MonthKey): number;
  setMonthNote(month: MonthKey, note: string): void;
  addSpendCategory(input: Pick<SpendCategory, 'name' | 'group'>): ID;
  updateSpendCategory(id: ID, patch: Partial<Pick<SpendCategory, 'name' | 'group' | 'hidden'>>): void;
  deleteSpendCategory(id: ID): void;
  /**
   * Take a category out of the list from a month screen: clears its amount for
   * that month, then hides it if other months still use it, or deletes it.
   */
  /** Stop offering a category in new months, keeping every amount; deletes it only if it was never used. */
  removeSpendCategory(id: ID): 'hidden' | 'deleted';
  moveSpendCategory(id: ID, direction: -1 | 1): void;
  /**
   * Put the categories a month shows in this order (after a drag). Categories
   * the month doesn't show keep their places among the rest of their group.
   */
  setSpendCategoryOrder(ids: ID[]): void;

  updateSettings(patch: Partial<Settings>): void;
  /** Made-up data covering the last `months` months (36 if left out). */
  loadSampleData(months?: number): void;
  eraseAll(): void;
  /** Replace everything with a backup made on `date`. */
  restore(data: Data, date: DateKey | null): void;
}

export type Store = Data & Actions;

/** A profile's saved data, read from storage. The store holds the open profile's; `profiles.ts` reads the others. */
export function loadData(key: string): Data {
  let raw: string | null = null;
  try {
    raw = storage.read(key);
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  if (!raw) return emptyData();
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    // Never silently throw away someone's data: keep the unreadable copy aside.
    console.warn('Saved data was unreadable; keeping a copy and starting fresh', e);
    storage.write(`${key}.unreadable.${Date.now()}`, raw).catch(() => {});
    return emptyData();
  }
}

/** Everything entered so far, as it's saved. */
export function currentData(): Data {
  return dataOf(useStore.getState());
}

/**
 * True while everything is being replaced at once (a backup restored, all data
 * erased, sample data loaded), which sync treats differently from an edit.
 */
let replacing = false;
export const isReplacing = () => replacing;

function replaceAll(run: () => void) {
  replacing = true;
  try {
    run();
  } finally {
    replacing = false;
  }
}

/** True while another profile's data is being put on screen, which isn't a change to anyone's data. */
let switching = false;
export const isSwitching = () => switching;

/** Show another profile's data in place of the one that was open. */
export function showProfileData(data: Data) {
  switching = true;
  try {
    useStore.setState(data);
  } finally {
    switching = false;
  }
}

function dataOf(s: Store): Data {
  return {
    version: DATA_VERSION,
    nwCategories: s.nwCategories,
    accounts: s.accounts,
    snapshots: s.snapshots,
    spendCategories: s.spendCategories,
    spend: s.spend,
    monthNotes: s.monthNotes,
    settings: s.settings,
  };
}

function reorder<T extends { id: ID; order: number }>(
  items: T[],
  id: ID,
  direction: -1 | 1,
  sameGroup: (a: T, b: T) => boolean,
): T[] {
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  const peers = items.filter((i) => sameGroup(i, target)).sort((a, b) => a.order - b.order);
  const index = peers.findIndex((i) => i.id === id);
  const swapWith = peers[index + direction];
  if (!swapWith) return items;
  const next = peers.map((p) => p.id);
  next[index] = swapWith.id;
  next[index + direction] = id;
  const orderOf = new Map(next.map((pid, i) => [pid, i]));
  return items.map((i) => (orderOf.has(i.id) ? { ...i, order: orderOf.get(i.id)! } : i));
}

function makeSnapshot(entry: NewSnapshot, createdAt: number): Snapshot {
  const snap: Snapshot = {
    id: newId(),
    accountId: entry.accountId,
    date: entry.date,
    value: Math.round(entry.value),
    createdAt,
  };
  if (entry.quantity != null) snap.quantity = entry.quantity;
  if (entry.unitPrice != null) snap.unitPrice = entry.unitPrice;
  if (entry.note) snap.note = entry.note;
  if (entry.source) snap.source = entry.source;
  return snap;
}

const realStore = create<Store>()((set, get) => ({
  ...loadData(dataKey(activeProfile())),

  addAccount({ name, categoryId, unit, metal, apr, initial }) {
    const id = newId();
    const now = Date.now();
    const account: Account = { id, name: name.trim(), categoryId, createdAt: now, closed: false };
    if (unit) account.unit = unit;
    if (metal) account.metal = metal;
    if (apr != null) account.apr = apr;
    set((s) => ({
      accounts: [...s.accounts, account],
      snapshots: initial ? [...s.snapshots, makeSnapshot({ ...initial, accountId: id }, now)] : s.snapshots,
    }));
    return id;
  },

  updateAccount(id, patch) {
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  },

  deleteAccount(id) {
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      snapshots: s.snapshots.filter((x) => x.accountId !== id),
    }));
  },

  closeAccount(id, date) {
    const latest = get()
      .snapshots.filter((x) => x.accountId === id)
      .sort(compareSnapshots)
      .pop();
    if (latest && latest.value !== 0) {
      get().addSnapshots([{ accountId: id, value: 0, date, note: 'Account closed' }]);
    }
    get().updateAccount(id, { closed: true });
  },

  reopenAccount(id) {
    get().updateAccount(id, { closed: false });
  },

  addSnapshots(entries) {
    if (entries.length === 0) return;
    const now = Date.now();
    const snaps = entries.map((e, i) => makeSnapshot(e, now + i));
    const reopened = new Set(entries.filter((e) => e.value !== 0).map((e) => e.accountId));
    set((s) => ({
      snapshots: [...s.snapshots, ...snaps],
      accounts: s.accounts.map((a) => (a.closed && reopened.has(a.id) ? { ...a, closed: false } : a)),
    }));
  },

  updateSnapshot(id, patch) {
    set((s) => ({
      snapshots: s.snapshots.map((x) => {
        if (x.id !== id) return x;
        const next: Snapshot = { ...x, ...patch };
        if (!next.note) delete next.note;
        if (!next.source) delete next.source;
        return next;
      }),
    }));
  },

  deleteSnapshot(id) {
    set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== id) }));
  },

  applySpotPrices(prices, today) {
    const updates = spotUpdates(get().accounts, get().snapshots, prices, today);
    if (updates.length === 0) return 0;
    const now = Date.now();
    const repriced = new Map<ID, { unitPrice: Cents; value: Cents }>();
    const added: Snapshot[] = [];
    for (const u of updates) {
      if (u.type === 'update') repriced.set(u.snapshotId, { unitPrice: u.unitPrice, value: u.value });
      else added.push(makeSnapshot({ ...u, source: 'spot' }, now + added.length));
    }
    set((s) => ({
      snapshots: [...s.snapshots.map((x) => (repriced.has(x.id) ? { ...x, ...repriced.get(x.id) } : x)), ...added],
    }));
    return updates.length;
  },

  addNWCategory({ name, kind }) {
    const id = newId();
    set((s) => ({
      nwCategories: [
        ...s.nwCategories,
        { id, name: name.trim(), kind, order: Math.max(-1, ...s.nwCategories.map((c) => c.order)) + 1 },
      ],
    }));
    return id;
  },

  updateNWCategory(id, patch) {
    set((s) => ({ nwCategories: s.nwCategories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },

  deleteNWCategory(id) {
    if (get().accounts.some((a) => a.categoryId === id)) return;
    set((s) => ({ nwCategories: s.nwCategories.filter((c) => c.id !== id) }));
  },

  moveNWCategory(id, direction) {
    set((s) => ({ nwCategories: reorder(s.nwCategories, id, direction, (a, b) => a.kind === b.kind) }));
  },

  setSpend(month, categoryId, amount) {
    set((s) => {
      const entries = { ...s.spend[month] };
      if (amount == null || amount === 0) delete entries[categoryId];
      else entries[categoryId] = amount;
      const spend = { ...s.spend };
      if (Object.keys(entries).length) spend[month] = entries;
      else delete spend[month];
      return { spend };
    });
  },

  fillRecurring(month) {
    const s = get();
    const previous = s.spend[shiftMonth(month, -1)] ?? {};
    const current = s.spend[month] ?? {};
    const recurring = s.spendCategories.filter((c) => c.group === 'recurring' && !c.hidden);
    let filled = 0;
    const entries = { ...current };
    for (const c of recurring) {
      if (!entries[c.id] && previous[c.id]) {
        entries[c.id] = previous[c.id];
        filled++;
      }
    }
    if (filled) set({ spend: { ...s.spend, [month]: entries } });
    return filled;
  },

  setMonthNote(month, note) {
    set((s) => {
      const monthNotes = { ...s.monthNotes };
      if (note.trim()) monthNotes[month] = note;
      else delete monthNotes[month];
      return { monthNotes };
    });
  },

  addSpendCategory({ name, group }) {
    const trimmed = name.trim();
    // Adding back a category that was removed brings back its history too.
    const removed = get().spendCategories.find(
      (c) => c.hidden && c.group === group && c.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (removed) {
      get().updateSpendCategory(removed.id, { hidden: false });
      return removed.id;
    }
    const id = newId();
    set((s) => {
      const peers = s.spendCategories.filter((c) => c.group === group);
      const order = Math.max(-1, ...peers.map((c) => c.order)) + 1;
      return { spendCategories: [...s.spendCategories, { id, name: trimmed, group, order, hidden: false }] };
    });
    return id;
  },

  updateSpendCategory(id, patch) {
    set((s) => ({
      spendCategories: s.spendCategories.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        if (patch.group && patch.group !== c.group) {
          next.order = Math.max(-1, ...s.spendCategories.filter((x) => x.group === patch.group).map((x) => x.order)) + 1;
        }
        return next;
      }),
    }));
  },

  removeSpendCategory(id) {
    // Stopping a category never touches amounts already entered: those months,
    // the totals and Insights keep them. Only a category with no amounts at all goes away.
    const stillUsed = Object.values(get().spend).some((entries) => !!entries[id]);
    if (stillUsed) {
      get().updateSpendCategory(id, { hidden: true });
      return 'hidden';
    }
    get().deleteSpendCategory(id);
    return 'deleted';
  },
  deleteSpendCategory(id) {
    set((s) => {
      const spend: Data['spend'] = {};
      for (const [month, entries] of Object.entries(s.spend)) {
        const { [id]: _removed, ...rest } = entries;
        if (Object.keys(rest).length) spend[month] = rest;
      }
      return { spendCategories: s.spendCategories.filter((c) => c.id !== id), spend };
    });
  },

  moveSpendCategory(id, direction) {
    set((s) => ({
      spendCategories: reorder(s.spendCategories, id, direction, (a, b) => a.group === b.group),
    }));
  },

  setSpendCategoryOrder(ids) {
    set((s) => ({ spendCategories: placeInOrder(s.spendCategories, ids, (a, b) => a.group === b.group) }));
  },

  updateSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  loadSampleData(months) {
    const settings = get().settings;
    replaceAll(() => set({ ...(months === DECADE ? decadeSampleData() : sampleData(months)), settings }));
  },

  eraseAll() {
    const settings = get().settings;
    replaceAll(() =>
      set({
        ...emptyData(),
        settings: {
          ...settings,
          requireUnlock: false,
          hideAmounts: false,
          reminder: { ...settings.reminder, on: false },
          goal: undefined,
          birthYear: undefined,
          name: '',
          outlook: { ...settings.outlook, monthly: undefined },
          spendingGoal: undefined,
        },
      }),
    );
  },

  restore(data, date) {
    // The lock, hidden amounts and reminder belong to this phone, not to the data.
    const { requireUnlock, hideAmounts, reminder } = get().settings;
    replaceAll(() =>
      set({
        ...data,
        settings: { ...data.settings, requireUnlock, hideAmounts, reminder, lastBackup: date ?? data.settings.lastBackup },
      }),
    );
  },
}));

/** True inside a first-open sample preview (see components/sample.tsx). */
export const SampleContext = createContext(false);

let sampleStore: UseBoundStore<StoreApi<Store>> | null = null;

/**
 * What a sample preview reads instead of the real data: made-up accounts and
 * spending held only in memory. It is never saved, backed up, exported or
 * synced, since all of those read the real store, and none of its actions do
 * anything. Settings (currency, name, hidden amounts) follow the real ones.
 */
function getSampleStore(): UseBoundStore<StoreApi<Store>> {
  if (sampleStore) return sampleStore;
  const real = realStore.getState();
  const inert = Object.fromEntries(
    Object.entries(real)
      .filter(([, value]) => typeof value === 'function')
      .map(([key]) => [key, () => undefined]),
  );
  const store = create<Store>()(() => ({ ...real, ...sampleData(), settings: real.settings, ...inert }) as Store);
  realStore.subscribe((state) => {
    if (state.settings !== store.getState().settings) store.setState({ settings: state.settings });
  });
  sampleStore = store;
  return store;
}

/**
 * The app's data. Inside a sample preview the same call reads the made-up
 * sample instead, so a screen draws either without knowing which. Everything
 * outside React (saving, backup, export, sync) always gets the real data.
 */
function useData<T>(selector: (state: Store) => T): T {
  const sample = useContext(SampleContext);
  // A screen is either inside a preview or not for as long as it's mounted.
  // Named as a hook so it's always called as one.
  const useSource = sample ? getSampleStore() : realStore;
  return useSource(selector);
}

export const useStore = Object.assign(useData, {
  getState: realStore.getState,
  setState: realStore.setState,
  subscribe: realStore.subscribe,
});

// Persistence: write the whole document shortly after each change, one write at a time.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

function writeNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  // Both read now, so a save that's waiting when profiles are switched still goes to the right one.
  const key = dataKey(activeProfile());
  const json = JSON.stringify(dataOf(useStore.getState()));
  writing = writing
    .then(() => storage.write(key, json))
    .catch((e) => console.warn('Could not save data', e));
  return writing;
}

export const DATA_KEYS = Object.keys(emptyData()) as (keyof Data)[];

useStore.subscribe((state, prev) => {
  if (DATA_KEYS.every((k) => state[k] === prev[k])) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
});

/** Save immediately, e.g. when the app goes to the background. */
export function flushSave(): Promise<void> {
  return saveTimer ? writeNow() : writing;
}
