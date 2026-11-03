import { monthKey, parseDateKey } from './dates';
import type { Month } from './insights';
import { monthsBetween, shift } from './trends';
import type { Cents, Data, DateKey, ID, SpendCategory, SpendGroup } from './types';

/**
 * One spending category month by month, to spot creep in a single line of
 * the budget: eating out at $150 in January and $500 by October.
 */

type SpendData = Pick<Data, 'spend' | 'spendCategories'>;

export interface CategoryMonth extends Month {
  /** What went to the category. Null when nothing at all was entered that month, so it isn't read as $0. */
  value: Cents | null;
}

/** Recurring and everyday spending first, ranked together by size, then investments and income. */
const RANK: Record<SpendGroup, number> = { recurring: 0, variable: 0, invest: 1, income: 2 };

const hasData = (entries: Record<ID, Cents> | undefined) => !!entries && Object.values(entries).some(Boolean);

/**
 * The last month to show: last month, once anything is entered up to then,
 * since a month still going would look like a drop. Before any month is
 * over, the current one.
 */
export function lastCountedMonth(data: SpendData, today: DateKey): Month {
  const t = parseDateKey(today);
  const now: Month = { year: t.y, month: t.m };
  const prev = shift(now, -1);
  const anyOver = Object.keys(data.spend).some((key) => key <= monthKey(prev.year, prev.month) && hasData(data.spend[key]));
  return anyOver ? prev : now;
}

/**
 * Every month from the category's first amount through the last counted
 * month, oldest first. Empty when it has none.
 */
export function categoryMonths(data: SpendData, id: ID, today: DateKey): CategoryMonth[] {
  const end = lastCountedMonth(data, today);
  const endKey = monthKey(end.year, end.month);
  const firstKey = Object.keys(data.spend)
    .filter((key) => key <= endKey && !!data.spend[key]?.[id])
    .sort()[0];
  if (!firstKey) return [];
  const [y, m] = firstKey.split('-').map(Number);
  const first: Month = { year: y, month: m };
  // A stopped category ends at its last amount instead of trailing off in zeros.
  const stopped = data.spendCategories.find((c) => c.id === id)?.hidden;
  const lastKey = stopped
    ? Object.keys(data.spend)
        .filter((key) => key <= endKey && !!data.spend[key]?.[id])
        .sort()
        .pop()!
    : endKey;
  return Array.from({ length: monthsBetween(first, end) + 1 }, (_, i) => {
    const month = shift(first, i);
    const key = monthKey(month.year, month.month);
    const entries = data.spend[key];
    if (key > lastKey) return { ...month, value: null };
    return { ...month, value: entries?.[id] ? entries[id] : hasData(entries) ? 0 : null };
  });
}

/** The last `count` months through the last counted month, with nulls before the category's first amount. */
export function recentCategoryMonths(data: SpendData, id: ID, today: DateKey, count: number): CategoryMonth[] {
  const all = categoryMonths(data, id, today);
  const end = lastCountedMonth(data, today);
  const byKey = new Map(all.map((m) => [monthKey(m.year, m.month), m.value]));
  return Array.from({ length: count }, (_, i) => {
    const month = shift(end, i - count + 1);
    return { ...month, value: byKey.get(monthKey(month.year, month.month)) ?? null };
  });
}

/** Average of the months that have something entered. Null when none does. */
export function averageOf(months: CategoryMonth[]): Cents | null {
  const counted = months.filter((m) => m.value != null);
  if (!counted.length) return null;
  return Math.round(counted.reduce((s, m) => s + m.value!, 0) / counted.length);
}

export interface CategoryChange {
  /** Average over the last three months with something entered. */
  recent: Cents;
  /** Average over the same months a year earlier, or the first months tracked. */
  before: Cents;
  /** Which `before` is: a year earlier, or since the month it started. */
  since: 'year' | Month;
}

/**
 * Lately (the last three months) against a year before, or against the first
 * three months tracked when there isn't a year yet. Null until there's
 * enough to say something: six months, or a year-ago month to compare with.
 */
export function categoryChange(months: CategoryMonth[]): CategoryChange | null {
  const counted = months.filter((m) => m.value != null);
  const lately = counted.slice(-3);
  if (!lately.length) return null;
  const recent = averageOf(lately)!;
  const byKey = new Map(months.map((m) => [monthKey(m.year, m.month), m]));
  const yearAgo = lately.flatMap((m) => {
    const then = shift(m, -12);
    const found = byKey.get(monthKey(then.year, then.month));
    return found && found.value != null ? [found] : [];
  });
  if (yearAgo.length) return { recent, before: averageOf(yearAgo)!, since: 'year' };
  if (counted.length < 6) return null;
  const start = counted.slice(0, 3);
  return { recent, before: averageOf(start)!, since: { year: start[0].year, month: start[0].month } };
}

export interface CategoryYear {
  year: number;
  /** A month on average, over the months entered. */
  monthly: Cents;
  months: number;
  /** Against the year before, e.g. 0.25 for 25% more. Null for the first year or from nothing. */
  change: number | null;
}

/** A month on average for each year, oldest first, each against the year before. */
export function categoryYears(months: CategoryMonth[]): CategoryYear[] {
  const years = [...new Set(months.map((m) => m.year))];
  const list: CategoryYear[] = [];
  for (const year of years) {
    const inYear = months.filter((m) => m.year === year && m.value != null);
    if (!inYear.length) continue;
    const monthly = averageOf(inYear)!;
    const prev = list[list.length - 1];
    list.push({
      year,
      monthly,
      months: inYear.length,
      change: prev && prev.year === year - 1 && prev.monthly > 0 ? monthly / prev.monthly - 1 : null,
    });
  }
  return list;
}

/**
 * The categories worth charting: any with an amount by the last counted
 * month, stopped ones included since they keep their history. Spending
 * comes first, biggest over the last year first, then investments and income.
 */
export function chartableCategories(data: SpendData, today: DateKey): SpendCategory[] {
  const end = lastCountedMonth(data, today);
  const endKey = monthKey(end.year, end.month);
  const startKey = monthKey(shift(end, -11).year, shift(end, -11).month);
  const lastYear = new Map<ID, Cents>();
  const any = new Set<ID>();
  for (const [key, entries] of Object.entries(data.spend)) {
    if (key > endKey) continue;
    for (const [id, amount] of Object.entries(entries)) {
      if (!amount) continue;
      any.add(id);
      if (key >= startKey) lastYear.set(id, (lastYear.get(id) ?? 0) + amount);
    }
  }
  return data.spendCategories
    .filter((c) => any.has(c.id))
    .sort(
      (a, b) =>
        RANK[a.group] - RANK[b.group] || (lastYear.get(b.id) ?? 0) - (lastYear.get(a.id) ?? 0) || a.order - b.order,
    );
}
