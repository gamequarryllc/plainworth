import type { AccountSummary } from './networth';
import type { NWSort } from './types';

export const NW_SORTS: { key: NWSort; title: string; detail?: string }[] = [
  { key: 'value', title: 'Highest Value' },
  { key: 'valueAsc', title: 'Lowest Value' },
  { key: 'updated', title: 'Recently Updated' },
  { key: 'stale', title: 'Least Recently Updated', detail: 'What needs an update comes first.' },
  { key: 'change', title: 'Biggest Change', detail: 'The largest move since the update before.' },
  { key: 'name', title: 'Name' },
];

export const DEFAULT_NW_SORT: NWSort = 'value';

/** A stand-in for something with a balance, a name and a latest update, like an account or a category. */
export interface Sortable {
  name: string;
  value: number;
  /** When it was last updated: `YYYY-MM-DD` plus the save time, or undefined with no balance yet. */
  updated?: { date: string; at: number };
  /** Its latest change, or null when there's nothing to compare. */
  change: number | null;
}

const byName = (a: Sortable, b: Sortable) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/** Positive when `a` was updated after `b`. Never-updated sorts as oldest. */
function updatedDiff(a: Sortable, b: Sortable): number {
  if (!a.updated || !b.updated) return (a.updated ? 1 : 0) - (b.updated ? 1 : 0);
  return a.updated.date.localeCompare(b.updated.date) || a.updated.at - b.updated.at;
}

/** Sort anything into the order picked from Sort By. Ties fall back to highest value, then name. */
export function sortBy<T>(items: T[], sort: NWSort | undefined, toSortable: (item: T) => Sortable): T[] {
  const keyed = items.map((item) => ({ item, s: toSortable(item) }));
  const tie = (a: Sortable, b: Sortable) => b.value - a.value || byName(a, b);
  const compare = (a: Sortable, b: Sortable): number => {
    switch (sort ?? DEFAULT_NW_SORT) {
      case 'valueAsc':
        return a.value - b.value || byName(a, b);
      case 'name':
        return byName(a, b) || b.value - a.value;
      case 'updated':
        return updatedDiff(b, a) || tie(a, b);
      case 'stale':
        return updatedDiff(a, b) || tie(a, b);
      case 'change': {
        // Nothing to compare goes last.
        const ca = a.change == null ? -1 : Math.abs(a.change);
        const cb = b.change == null ? -1 : Math.abs(b.change);
        return cb - ca || tie(a, b);
      }
      default:
        return tie(a, b);
    }
  };
  return keyed.sort((a, b) => compare(a.s, b.s)).map((k) => k.item);
}

export function accountSortable(s: AccountSummary): Sortable {
  return {
    name: s.account.name,
    value: s.balance,
    updated: s.latest ? { date: s.latest.date, at: s.latest.createdAt } : undefined,
    change: s.lastChange,
  };
}

export function sortAccounts(summaries: AccountSummary[], sort: NWSort | undefined): AccountSummary[] {
  return sortBy(summaries, sort, accountSortable);
}

/** Folds a group of accounts (a category) into one sortable: total, latest update, latest moves added up. */
export function groupSortable(name: string, items: AccountSummary[]): Sortable {
  let updated: Sortable['updated'];
  let change: number | null = null;
  for (const s of items) {
    const u = accountSortable(s).updated;
    if (u && (!updated || u.date > updated.date || (u.date === updated.date && u.at > updated.at))) updated = u;
    if (s.lastChange != null) change = (change ?? 0) + s.lastChange;
  }
  return { name, value: items.reduce((sum, s) => sum + s.balance, 0), updated, change };
}
