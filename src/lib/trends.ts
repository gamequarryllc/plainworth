import { dayNumber, monthKey, parseDateKey, parseMonthKey } from './dates';
import { holdingsOn, netWorthMonths, spendingYear, type Month } from './insights';
import { monthTotals, type MonthTotals } from './spending';
import type { Cents, Data, DateKey, NWCategory } from './types';

/**
 * Progress over time for the Insights charts: where net worth is headed, this
 * year against last, and lifestyle creep. Net worth trends come from
 * balances alone and spending trends from Spending alone.
 */

type NWData = Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>;
type SpendData = Pick<Data, 'spend' | 'spendCategories'>;

/** Months between two months, so `monthsBetween(Jan, Mar)` is 2. */
export function monthsBetween(a: Month, b: Month): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** The month `n` months after `m` (or before, when negative). */
export function shift(m: Month, n: number): Month {
  const total = m.year * 12 + (m.month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month;

export interface NetWorthMonth extends Month {
  /** Net worth at the end of the month, or today for the current month. */
  end: Cents;
  /** How much it moved in the month. Accounts added along the way count from their first balance. */
  change: Cents;
  /** False for the month still going. */
  finished: boolean;
}

/** Every month from the first balance through the current one, oldest first. */
export function netWorthHistory(data: NWData, today: DateKey): NetWorthMonth[] {
  if (!data.snapshots.length) return [];
  const t = parseDateKey(today);
  const now: Month = { year: t.y, month: t.m };
  let first = now;
  for (const s of data.snapshots) {
    const d = parseDateKey(s.date);
    const m = { year: d.y, month: d.m };
    if (monthsBetween(m, first) > 0) first = m;
  }
  const list = Array.from({ length: monthsBetween(first, now) + 1 }, (_, i) => shift(first, i));
  const nw = netWorthMonths(data, list, today);
  if (!nw) return [];
  return list.flatMap((m, i) => {
    const c = nw.months[i];
    return c ? [{ ...m, end: c.end, change: c.change, finished: !sameMonth(m, now) }] : [];
  });
}

/**
 * The average change in a finished month, over the last twelve. Null until two
 * months have finished, since one month says little about a pace.
 */
export function netWorthPace(history: NetWorthMonth[]): { perMonth: Cents; months: number } | null {
  const done = history.filter((m) => m.finished).slice(-12);
  if (done.length < 2) return null;
  return { perMonth: Math.round(done.reduce((s, m) => s + m.change, 0) / done.length), months: done.length };
}

const STEPS = [1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000].map(
  (dollars) => dollars * 100,
);

/** The round number to aim for next: $100k from $84k, $10k from $8k, $400k from $320k. Zero while below it. */
export function nextMilestone(current: Cents): Cents {
  if (current < 0) return 0;
  const half = Math.max(current / 2, STEPS[0]);
  const step = [...STEPS].reverse().find((s) => s <= half) ?? STEPS[0];
  return (Math.floor(current / step) + 1) * step;
}

/** How many months until `target` at `perMonth`, or null when the pace doesn't head there. */
export function monthsUntil(current: Cents, target: Cents, perMonth: Cents): number | null {
  if (perMonth <= 0 || target <= current) return null;
  return Math.ceil((target - current) / perMonth);
}

/**
 * How much net worth has grown since the year began, at the end of each month:
 * twelve entries, null before the first balance and for months still to come.
 */
export function netWorthSoFar(history: NetWorthMonth[], year: number): (Cents | null)[] {
  const byMonth = new Map(history.filter((m) => m.year === year).map((m) => [m.month, m.change]));
  let sum = 0;
  return Array.from({ length: 12 }, (_, i) => {
    const change = byMonth.get(i + 1);
    if (change == null) return null;
    sum += change;
    return sum;
  });
}

/**
 * How much has been spent since the year began, at the end of each month that
 * counts (see `spendingYear`): twelve entries, null outside the counted months.
 */
export function spentSoFar(data: SpendData, year: number, today: DateKey): (Cents | null)[] {
  const sp = spendingYear(data, year, today);
  if (!sp) return Array(12).fill(null);
  const lastCounted = sp.spent.reduce<number>((last, v, i) => (v != null ? i : last), -1);
  let sum = 0;
  let started = false;
  return sp.spent.map((v, i) => {
    if (v != null) started = true;
    if (!started || i > lastCounted) return null;
    sum += v ?? 0;
    return sum;
  });
}

export interface SpendMonth extends Month {
  totals: MonthTotals;
}

/** Every finished month with something entered in Spending, oldest first. */
export function spendHistory(data: SpendData, today: DateKey): SpendMonth[] {
  const t = parseDateKey(today);
  const now: Month = { year: t.y, month: t.m };
  const categories = new Map(data.spendCategories.map((c) => [c.id, c]));
  return Object.keys(data.spend)
    .sort()
    .map((key) => ({ ...parseMonthKey(key), totals: monthTotals(data.spend[key], categories) }))
    .filter((m) => m.totals.hasData && monthsBetween(m, now) > 0);
}

export interface Creep {
  year: number;
  /** This year's average month against last year's, e.g. 0.08 for 8% more. Null without income last year. */
  income: number | null;
  spending: number;
  /** From January last year to the latest finished month: each month's six-month average, as a change from the first. */
  months: Month[];
  incomeLine: (number | null)[];
  spendingLine: (number | null)[];
}

/**
 * Lifestyle creep: whether spending is growing faster than income. Compares
 * this year's average month with last year's, once each has two finished months.
 */
export function lifestyleCreep(data: SpendData, today: DateKey): Creep | null {
  const year = parseDateKey(today).y;
  const history = spendHistory(data, today);
  const of = (y: number) => history.filter((m) => m.year === y);
  const now = of(year);
  const before = of(year - 1);
  if (now.length < 2 || before.length < 2) return null;
  const avg = (list: SpendMonth[], pick: (t: MonthTotals) => number) =>
    list.reduce((s, m) => s + pick(m.totals), 0) / list.length;
  const spendBefore = avg(before, (t) => t.expenses);
  if (spendBefore <= 0) return null;
  const incomeBefore = avg(before, (t) => t.income);
  const spending = avg(now, (t) => t.expenses) / spendBefore - 1;
  const income = incomeBefore > 0 ? avg(now, (t) => t.income) / incomeBefore - 1 : null;

  // The chart: a six-month average smooths out bonuses and one-off months.
  const start: Month = { year: year - 1, month: 1 };
  const last = now[now.length - 1];
  const months = Array.from({ length: monthsBetween(start, last) + 1 }, (_, i) => shift(start, i));
  const byKey = new Map(history.map((m) => [monthKey(m.year, m.month), m.totals]));
  const smooth = (pick: (t: MonthTotals) => number) => {
    const raw = months.map((m) => {
      const window = [0, -1, -2, -3, -4, -5].flatMap((k) => {
        const s = shift(m, k);
        const totals = byKey.get(monthKey(s.year, s.month));
        return totals ? [pick(totals)] : [];
      });
      return byKey.has(monthKey(m.year, m.month)) && window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
    });
    const base = raw.find((v) => v != null && v > 0);
    return raw.map((v) => (v == null || base == null ? null : v / base - 1));
  };
  return {
    year,
    income,
    spending,
    months,
    incomeLine: income == null ? months.map(() => null) : smooth((t) => t.income),
    spendingLine: smooth((t) => t.expenses),
  };
}

export type PeriodUnit = 'month' | 'quarter' | 'year';

export interface Distribution {
  /** Oldest first: the last month of each period, which is the current one for the latest. */
  periods: (Month & { unit: PeriodUnit })[];
  /** Asset categories that had something in any period, biggest (in the latest period) first. */
  categories: NWCategory[];
  /** values[period][category]: what was in it at the end of the period, or today for the current one. */
  values: Cents[][];
}

/**
 * What you own by category at the end of each of the last few months,
 * quarters or years, for the stacked "Distribution" chart. Debts aren't
 * included: it shows what your assets are made of. Periods before the first
 * balance are left out.
 */
export function distribution(data: NWData, today: DateKey, unit: PeriodUnit, count = 6): Distribution {
  const t = parseDateKey(today);
  const todayDay = dayNumber(today);
  const step = unit === 'month' ? 1 : unit === 'quarter' ? 3 : 12;
  // The last month of the current period.
  const current: Month = {
    year: t.y,
    month: unit === 'month' ? t.m : unit === 'quarter' ? Math.ceil(t.m / 3) * 3 : 12,
  };
  const periods = Array.from({ length: count }, (_, i) => ({ ...shift(current, (i - count + 1) * step), unit }));
  const rows = periods.map((p) => {
    const end = Math.round(Date.UTC(p.year, p.month, 0) / 86_400_000);
    return holdingsOn(data, Math.min(end, todayDay));
  });
  const first = rows.findIndex((h) => h.assets.length > 0);
  if (first < 0) return { periods: [], categories: [], values: [] };
  const kept = rows.slice(first);
  const latest = new Map(kept[kept.length - 1].assets.map((a) => [a.category.id, a.total]));
  const seen = new Map<string, NWCategory>();
  for (const h of kept) for (const a of h.assets) seen.set(a.category.id, a.category);
  const categories = [...seen.values()].sort(
    (a, b) => (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0) || a.order - b.order,
  );
  return {
    periods: periods.slice(first),
    categories,
    values: kept.map((h) => {
      const totals = new Map(h.assets.map((a) => [a.category.id, a.total]));
      return categories.map((c) => totals.get(c.id) ?? 0);
    }),
  };
}
