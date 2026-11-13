import { dayNumber, monthKey, parseDateKey, parseMonthKey } from './dates';
import { holdingsOn, netWorthMonths, spendingYear, type Month } from './insights';
import { monthTotals, type MonthTotals } from './spending';
import type { Cents, Data, DateKey, NWCategory, SpendingGoal } from './types';

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

/** This year's running total next to last year's, for This Year vs Last Year. */
export interface YearsCompared {
  /** The month this year's total starts: 0 for January, later when your first balance or month came later. */
  from: number;
  /** The latest month in it. */
  last: number;
  /** Last year's running total, counted from the same month when it can be. */
  before: (Cents | null)[];
  /** Last year's total over the same months, or null when last year doesn't cover them all. */
  then: Cents | null;
}

/**
 * Lines up this year's running total (`netWorthSoFar`, `spentSoFar`) with
 * last year's. When this year starts after January, last year is counted
 * from the same month, so both cover the same months. When last year started
 * later than this year (or stopped sooner), there's nothing fair to compare,
 * so `then` is null: part of a year is never put against more of one.
 */
export function compareYears(soFar: (Cents | null)[], before: (Cents | null)[]): YearsCompared | null {
  const from = soFar.findIndex((v) => v != null);
  if (from < 0) return null;
  const last = soFar.reduce<number>((l, v, i) => (v != null ? i : l), -1);
  const start = before.findIndex((v) => v != null);
  if (start < 0 || start > from) return { from, last, before, then: null };
  // Before `from`, last year's total is what came ahead of this year's start.
  const base = from > 0 ? (before[from - 1] ?? 0) : 0;
  const counted = before.map((v, i) => (v == null || i < from ? null : v - base));
  return { from, last, before: counted, then: counted[last] };
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

export interface CreepMonth extends Month {
  /** Spent in the month, or null when nothing was entered. */
  spent: Cents | null;
  /** Earned in the month, or null when nothing was entered. */
  earned: Cents | null;
}

/** A run of entered months averaged together: where spending was, or is lately. */
export interface CreepWindow {
  /** The first and last month in it. */
  from: Month;
  to: Month;
  /** Average spent a month. */
  spent: Cents;
  /** Average earned a month, or null when no income was entered in these months. */
  earned: Cents | null;
}

export interface Creep {
  /** Every month in the range, oldest first, including empty ones so the chart keeps time. */
  months: CreepMonth[];
  /**
   * Where in `months` spending started to climb (or fall): the first month
   * after the steady stretch. Null when spending has held about steady.
   */
  start: number | null;
  direction: 'up' | 'down' | 'steady';
  /** The steady stretch before the change, averaged. */
  before: CreepWindow;
  /** The last three entered months, averaged. */
  lately: CreepWindow;
}

/** Entered months needed on each side of the change. */
const CREEP_SIDE = 3;
/** Less of a change than this (10%) counts as holding steady. */
const CREEP_STEADY = 0.1;

/**
 * Every month from the first one entered in Spending through the latest
 * finished one entered, oldest first. Months in between with nothing
 * entered are kept, empty, so a chart of them keeps time.
 */
export function creepMonths(data: SpendData, today: DateKey): CreepMonth[] {
  const history = spendHistory(data, today);
  if (!history.length) return [];
  const byKey = new Map(history.map((m) => [monthKey(m.year, m.month), m.totals]));
  const first = history[0];
  return Array.from({ length: monthsBetween(first, history[history.length - 1]) + 1 }, (_, i) => {
    const m = shift(first, i);
    const t = byKey.get(monthKey(m.year, m.month));
    return { ...m, spent: t ? t.expenses : null, earned: t ? t.income : null };
  });
}

/** How far a straight line through these points misses them, squared and added up. */
function lineMiss(points: [number, number][]): number {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx ? points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  return points.reduce((s, p) => s + (p[1] - (my + slope * (p[0] - mx))) ** 2, 0);
}

/**
 * Lifestyle creep in dollars: finds where spending stopped holding steady
 * and started to climb, like the months after a raise. It tries every place
 * the change could start and keeps the one where "flat, then a straight
 * line" fits the months best, so both a sudden jump and a steady climb are
 * found where they begin. Null until there are six entered months.
 */
export function lifestyleCreep(months: CreepMonth[]): Creep | null {
  const entered = months.flatMap((m, i) => (m.spent != null ? [i] : []));
  if (entered.length < CREEP_SIDE * 2) return null;
  const value = (i: number) => months[i].spent ?? 0;

  let split = CREEP_SIDE;
  let best = Infinity;
  for (let p = CREEP_SIDE; p <= entered.length - CREEP_SIDE; p++) {
    const flat = entered.slice(0, p);
    const mean = flat.reduce((s, i) => s + value(i), 0) / p;
    const miss =
      flat.reduce((s, i) => s + (value(i) - mean) ** 2, 0) +
      lineMiss(entered.slice(p).map((i) => [i, value(i)] as [number, number]));
    if (miss < best - 1e-6) {
      best = miss;
      split = p;
    }
  }

  const window = (indexes: number[]): CreepWindow => {
    const list = indexes.map((i) => months[i]);
    const earned = list.reduce((s, m) => s + (m.earned ?? 0), 0);
    return {
      from: { year: list[0].year, month: list[0].month },
      to: { year: list[list.length - 1].year, month: list[list.length - 1].month },
      spent: Math.round(list.reduce((s, m) => s + (m.spent ?? 0), 0) / list.length),
      earned: earned > 0 ? Math.round(earned / list.length) : null,
    };
  };
  const before = window(entered.slice(0, split));
  const lately = window(entered.slice(-CREEP_SIDE));
  const change = before.spent > 0 ? lately.spent / before.spent - 1 : lately.spent > 0 ? 1 : 0;
  const direction = Math.abs(change) < CREEP_STEADY ? 'steady' : change > 0 ? 'up' : 'down';
  return { months, start: direction === 'steady' ? null : entered[split], direction, before, lately };
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

export interface YearGoals {
  /** Finished months with something entered, so far this year. */
  months: number;
  /** Months still to come this year, counting the one going now. */
  left: number;
  /** Share of income saved so far this year; null without income. */
  kept: number | null;
  /**
   * To end the year at the savings goal: the share of income to keep from here
   * on, assuming income carries on as it has. 0 or less means you're there
   * already; more than 1 means it's out of reach. Null without a goal or income.
   */
  keepFromHere: number | null;
  /** Average spent a month so far this year; null before any month counts. */
  spent: Cents | null;
  /** To end the year at or under the limit: the most to spend in an average month from here on. Null without a limit. */
  spendFromHere: Cents | null;
}

/**
 * How this year is going against the spending goals. Both are judged over the
 * whole year, so one big month (a car, a move) can be made up for later.
 * Months count once they're over, like the other Spending insights.
 */
export function yearGoals(data: SpendData, goal: SpendingGoal, year: number, today: DateKey): YearGoals {
  const t = parseDateKey(today);
  const categories = new Map(data.spendCategories.map((c) => [c.id, c]));
  const lastOver = year < t.y ? 12 : year === t.y ? t.m - 1 : 0;
  const totals = Array.from({ length: 12 }, (_, i) => monthTotals(data.spend[monthKey(year, i + 1)], categories));
  const lastEntered = totals.reduce<number>((last, m, i) => (m.hasData && i < lastOver ? i : last), -1);

  let months = 0;
  let spentSum = 0;
  let income = 0;
  let net = 0;
  let incomeMonths = 0;
  totals.forEach((m, i) => {
    if (i > lastEntered) return;
    if (m.hasData) {
      months++;
      spentSum += m.expenses;
    }
    if (m.income > 0) {
      income += m.income;
      net += m.net;
      incomeMonths++;
    }
  });

  const left = 12 - lastOver;
  const kept = income > 0 ? net / income : null;
  let keepFromHere: number | null = null;
  if (goal.keep != null && income > 0 && left > 0) {
    const ahead = (income / incomeMonths) * left;
    keepFromHere = (goal.keep * (income + ahead) - net) / ahead;
  }
  const spent = months ? Math.round(spentSum / months) : null;
  const spendFromHere =
    goal.limit != null && left > 0 ? Math.round((goal.limit * (months + left) - spentSum) / left) : null;
  return { months, left, kept, keepFromHere, spent, spendFromHere };
}
