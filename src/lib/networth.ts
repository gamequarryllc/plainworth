import { addMonths, dateKey, dayNumber, parseDateKey } from './dates';
import type {
  Account,
  CategoryKind,
  Cents,
  DateKey,
  ID,
  NWCategory,
  RangeKey,
  Snapshot,
} from './types';

export interface SeriesPoint {
  /** Day number. Same-day updates sit at fractions of the day, in the order they were made. */
  day: number;
  value: Cents;
  /** When this update was saved, for days with more than one, so the chart can show the time. */
  at?: number;
}

/** Entries saved this close together (Update Balances, live prices) count as one update. */
const SAME_UPDATE_MS = 60_000;

export const RANGES: { key: RangeKey; label: string; caption: string }[] = [
  { key: '1M', label: '1M', caption: 'Past Month' },
  { key: '3M', label: '3M', caption: 'Past 3 Months' },
  { key: '6M', label: '6M', caption: 'Past 6 Months' },
  { key: 'YTD', label: 'YTD', caption: 'Year to Date' },
  { key: '1Y', label: '1Y', caption: 'Past Year' },
  { key: 'ALL', label: 'All', caption: 'All Time' },
];

export function rangeCaption(range: RangeKey): string {
  return RANGES.find((r) => r.key === range)?.caption ?? '';
}

/** Oldest first; entries on the same day keep the order they were made in. */
export function compareSnapshots(a: Snapshot, b: Snapshot): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.createdAt - b.createdAt;
}

export function snapshotsByAccount(snapshots: Snapshot[]): Map<ID, Snapshot[]> {
  const map = new Map<ID, Snapshot[]>();
  for (const s of [...snapshots].sort(compareSnapshots)) {
    const list = map.get(s.accountId);
    if (list) list.push(s);
    else map.set(s.accountId, [s]);
  }
  return map;
}

export function kindOf(account: Account, categories: Map<ID, NWCategory>): CategoryKind {
  return categories.get(account.categoryId)?.kind ?? 'asset';
}

export interface AccountSummary {
  account: Account;
  kind: CategoryKind;
  balance: Cents;
  latest?: Snapshot;
  previous?: Snapshot;
  /** Change versus the entry before the latest one. */
  lastChange: Cents | null;
}

export function summarizeAccounts(
  accounts: Account[],
  snapshots: Snapshot[],
  categories: NWCategory[],
): Map<ID, AccountSummary> {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const byAccount = snapshotsByAccount(snapshots);
  const out = new Map<ID, AccountSummary>();
  for (const account of accounts) {
    const list = byAccount.get(account.id) ?? [];
    const latest = list[list.length - 1];
    const previous = list[list.length - 2];
    out.set(account.id, {
      account,
      kind: kindOf(account, cats),
      balance: latest?.value ?? 0,
      latest,
      previous,
      lastChange: latest && previous ? latest.value - previous.value : null,
    });
  }
  return out;
}

export interface Totals {
  assets: Cents;
  liabilities: Cents;
  net: Cents;
}

export function totalsOf(summaries: Iterable<AccountSummary>): Totals {
  let assets = 0;
  let liabilities = 0;
  for (const s of summaries) {
    if (s.kind === 'asset') assets += s.balance;
    else liabilities += s.balance;
  }
  return { assets, liabilities, net: assets - liabilities };
}

/**
 * Value over time: one point per update, where an update is a save (entries
 * saved within a minute of each other, like Update Balances, count as one).
 * A value is every included account's latest balance as of that update. When
 * a day has several updates they share the day evenly, in the order they were
 * made, so 100 then 104 on the same day both show on the chart. With `signed`,
 * liabilities count against the total (net worth); otherwise balances are
 * simply added (a category or a single account).
 */
export function buildSeries(
  snapshots: Snapshot[],
  accounts: Account[],
  categories: NWCategory[],
  opts: { include?: (a: Account) => boolean; signed?: boolean } = {},
): SeriesPoint[] {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const sign = new Map<ID, number>();
  for (const a of accounts) {
    if (opts.include && !opts.include(a)) continue;
    sign.set(a.id, opts.signed && kindOf(a, cats) === 'liability' ? -1 : 1);
  }
  return updateSeries(snapshots.filter((s) => sign.has(s.accountId)).sort(compareSnapshots), sign);
}

/**
 * Each account's balance at every update, like `buildSeries` for one account,
 * for the small charts in account rows. (`seriesByAccount` keeps one point per
 * day, which the day-by-day math in Insights and the export relies on.)
 */
export function updatesByAccount(snapshots: Snapshot[]): Map<ID, SeriesPoint[]> {
  const out = new Map<ID, SeriesPoint[]>();
  for (const [accountId, list] of snapshotsByAccount(snapshots)) {
    out.set(accountId, updateSeries(list, new Map([[accountId, 1]])));
  }
  return out;
}

/** The running total of sorted entries, one point per update (see `buildSeries`). */
function updateSeries(sorted: Snapshot[], sign: Map<ID, number>): SeriesPoint[] {
  const current = new Map<ID, Cents>();
  // Each day's updates: the total after each one, and when it was saved.
  const days: { day: number; date: DateKey; updates: { value: Cents; at: number }[] }[] = [];
  let total = 0;
  for (const s of sorted) {
    const k = sign.get(s.accountId)!;
    total += k * (s.value - (current.get(s.accountId) ?? 0));
    current.set(s.accountId, s.value);
    const day = dayNumber(s.date);
    let entry = days[days.length - 1];
    if (!entry || entry.day !== day) {
      entry = { day, date: s.date, updates: [] };
      days.push(entry);
    }
    const last = entry.updates[entry.updates.length - 1];
    if (last && s.createdAt - last.at < SAME_UPDATE_MS) {
      last.value = total;
      last.at = s.createdAt;
    } else {
      entry.updates.push({ value: total, at: s.createdAt });
    }
  }
  const points: SeriesPoint[] = [];
  for (const { day, date, updates } of days) {
    if (updates.length === 1) {
      points.push({ day, value: updates[0].value });
      continue;
    }
    updates.forEach((u, i) => {
      const point: SeriesPoint = { day: day + i / updates.length, value: u.value };
      // Only a time saved on that same day is the time of day it changed; a backdated entry's isn't.
      if (dateKey(new Date(u.at)) === date) point.at = u.at;
      points.push(point);
    });
  }
  return points;
}

/** Each account's balance over time, one point per day that had an entry. */
export function seriesByAccount(snapshots: Snapshot[]): Map<ID, SeriesPoint[]> {
  const out = new Map<ID, SeriesPoint[]>();
  for (const [accountId, list] of snapshotsByAccount(snapshots)) {
    const points: SeriesPoint[] = [];
    for (const s of list) {
      const day = dayNumber(s.date);
      const last = points[points.length - 1];
      if (last && last.day === day) last.value = s.value;
      else points.push({ day, value: s.value });
    }
    out.set(accountId, points);
  }
  return out;
}

export function rangeStart(range: RangeKey, today: DateKey): number | null {
  switch (range) {
    case '1M':
      return dayNumber(addMonths(today, -1));
    case '3M':
      return dayNumber(addMonths(today, -3));
    case '6M':
      return dayNumber(addMonths(today, -6));
    case '1Y':
      return dayNumber(addMonths(today, -12));
    case 'YTD':
      return dayNumber(`${parseDateKey(today).y}-01-01`);
    case 'ALL':
      return null;
  }
}

/**
 * Cut a series down to a range. The first point carries the value as of the
 * range start (when there is history before it) and the line is extended flat
 * to today.
 */
export function sliceSeries(points: SeriesPoint[], range: RangeKey, today: DateKey): SeriesPoint[] {
  if (points.length === 0) return [];
  const todayDay = dayNumber(today);
  const start = rangeStart(range, today);
  const out: SeriesPoint[] = [];
  if (start == null) {
    out.push(...points);
  } else {
    let before: SeriesPoint | undefined;
    for (const p of points) {
      if (p.day <= start) before = p;
      else out.push(p);
    }
    if (before) out.unshift({ day: start, value: before.value });
  }
  const last = out[out.length - 1];
  if (last && last.day < todayDay) out.push({ day: todayDay, value: last.value });
  if (out.length === 1) out.unshift({ day: out[0].day - 1, value: out[0].value });
  return out;
}

export function seriesChange(points: SeriesPoint[], upTo?: number): { delta: Cents; ratio: number } {
  if (points.length === 0) return { delta: 0, ratio: 0 };
  const first = points[0].value;
  const last = points[Math.min(upTo ?? points.length - 1, points.length - 1)].value;
  const delta = last - first;
  return { delta, ratio: first !== 0 ? delta / Math.abs(first) : 0 };
}
