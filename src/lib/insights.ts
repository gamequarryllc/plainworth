import { dayNumber, monthKey, MONTHS, parseDateKey, parseMonthKey } from './dates';
import { kindOf, seriesByAccount, type SeriesPoint } from './networth';
import { earnedTotals, monthTotals, savingsRate, yearSummary, type MonthTotals } from './spending';
import type { Account, Cents, Data, DateKey, ID, MonthKey, NWCategory, SpendCategory, SpendGroup } from './types';

/** A value on a day: the latest point on or before it, or undefined before the first one. */
export function valueAt(points: SeriesPoint[], day: number): Cents | undefined {
  let value: Cents | undefined;
  for (const p of points) {
    if (p.day > day) break;
    value = p.value;
  }
  return value;
}

export interface Change {
  start: Cents;
  end: Cents;
  change: Cents;
}

/**
 * How net worth moved between the end of day `from` and the end of day `to`.
 * An account added along the way counts from its first balance, so adding
 * accounts isn't mistaken for growth. Null when nothing was entered by `to`.
 */
function changeBetween(
  perAccount: Map<ID, SeriesPoint[]>,
  signs: Map<ID, number>,
  from: number,
  to: number,
): Change | null {
  let start = 0;
  let end = 0;
  let any = false;
  for (const [id, points] of perAccount) {
    const sign = signs.get(id);
    const last = valueAt(points, to);
    if (sign == null || last == null) continue;
    any = true;
    start += sign * (valueAt(points, from) ?? points[0].value);
    end += sign * last;
  }
  return any ? { start, end, change: end - start } : null;
}

export interface NetWorthYear extends Change {
  /** The change relative to where the period started, or null when that was zero. */
  ratio: number | null;
  /** One entry per month: null before the first balance and for months still to come. */
  months: (Change | null)[];
}

/** A calendar month. */
export interface Month {
  year: number;
  /** 1 to 12. */
  month: number;
}

/** Counted from the end of day `from` to the end of day `to` (day numbers, see `dayNumber`). */
export interface Span {
  from: number;
  to: number;
}

const firstDay = (year: number, month: number) => dayNumber(`${monthKey(year, month)}-01`);
/** Day 0 of the next month is the last day of this one. */
const lastDay = (year: number, month: number) => Math.round(Date.UTC(year, month, 0) / 86_400_000);
const monthsOf = (year: number): Month[] => Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }));

/** The `count` whole months before the one `today` is in, oldest first: on November 1, September and October. */
export function recentMonths(today: DateKey, count = 2): Month[] {
  const t = parseDateKey(today);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(t.y, t.m - 1 - count + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });
}

/** "September and October", or "December 2025 and January 2026" across a new year. */
export function monthsLabel(list: Month[]): string {
  const oneYear = list.every((m) => m.year === list[0]?.year);
  const names = list.map((m) => (oneYear ? MONTHS[m.month - 1] : `${MONTHS[m.month - 1]} ${m.year}`));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

/** From the end of the day before January 1 to the end of the year, or today. Null for a year still to come. */
export function yearSpan(year: number, today: DateKey): Span | null {
  return monthsSpan(monthsOf(year), today);
}

/** From the end of the day before the first month to the end of the last, or today. Null if it hasn't started. */
export function monthsSpan(months: Month[], today: DateKey): Span | null {
  const first = months[0];
  const last = months[months.length - 1];
  const todayDay = dayNumber(today);
  if (!first || firstDay(first.year, first.month) > todayDay) return null;
  return { from: firstDay(first.year, first.month) - 1, to: Math.min(lastDay(last.year, last.month), todayDay) };
}

/** Net worth over a calendar year (up to today), and month by month. Null when there's nothing to show yet. */
export function netWorthYear(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  year: number,
  today: DateKey,
): NetWorthYear | null {
  return netWorthMonths(data, monthsOf(year), today);
}

/** Net worth over a run of months (up to today), and in each of them. Null when there's nothing to show yet. */
export function netWorthMonths(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  list: Month[],
  today: DateKey,
): NetWorthYear | null {
  const span = monthsSpan(list, today);
  if (!span) return null;
  const perAccount = seriesByAccount(data.snapshots);
  const signs = accountSigns(data.accounts, data.nwCategories);
  const total = changeBetween(perAccount, signs, span.from, span.to);
  if (!total) return null;
  const todayDay = dayNumber(today);
  const months = list.map(({ year, month }) => {
    const first = firstDay(year, month);
    if (first > todayDay) return null;
    return changeBetween(perAccount, signs, first - 1, Math.min(lastDay(year, month), todayDay));
  });
  return { ...total, ratio: total.start !== 0 ? total.change / Math.abs(total.start) : null, months };
}

function accountSigns(accounts: Account[], categories: NWCategory[]): Map<ID, number> {
  const cats = new Map(categories.map((c) => [c.id, c]));
  return new Map(accounts.map((a) => [a.id, kindOf(a, cats) === 'liability' ? -1 : 1]));
}

export interface Holding {
  category: NWCategory;
  total: Cents;
  /** Share of all assets (or of all debts). */
  share: number;
}

export interface Holdings {
  assets: Holding[];
  debts: Holding[];
  assetTotal: Cents;
  debtTotal: Cents;
}

/** What was owned and owed by category at the end of a day, largest first. */
export function holdingsOn(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  day: number,
): Holdings {
  const perAccount = seriesByAccount(data.snapshots);
  const totals = new Map<ID, Cents>();
  for (const account of data.accounts) {
    const value = valueAt(perAccount.get(account.id) ?? [], day);
    if (!value) continue;
    totals.set(account.categoryId, (totals.get(account.categoryId) ?? 0) + value);
  }
  const rows = (kind: NWCategory['kind']) => {
    const list = data.nwCategories
      .filter((c) => c.kind === kind && (totals.get(c.id) ?? 0) > 0)
      .map((category) => ({ category, total: totals.get(category.id)!, share: 0 }));
    const sum = list.reduce((s, r) => s + r.total, 0);
    for (const r of list) r.share = sum ? r.total / sum : 0;
    return { list: list.sort((a, b) => b.total - a.total), sum };
  };
  const assets = rows('asset');
  const debts = rows('liability');
  return { assets: assets.list, debts: debts.list, assetTotal: assets.sum, debtTotal: debts.sum };
}

/** Months whose change is settled: all of a past year's, and this year's before the current one. */
export function finishedMonths(nw: NetWorthYear, year: number, today: DateKey): { month: number; change: Cents }[] {
  const t = parseDateKey(today);
  return nw.months.flatMap((m, i) => (m && !(year === t.y && i + 1 >= t.m) ? [{ month: i, change: m.change }] : []));
}

/** Whole-cent average, or null for an empty list. */
export function average(values: number[]): Cents | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

export interface CategoryChange {
  category: NWCategory;
  /** What the category added to net worth over the period: for a debt, paying it down counts as adding. */
  change: Cents;
}

/** How much each category moved net worth over a year (up to today), biggest gain first. Balances only. */
export function categoryChanges(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  year: number,
  today: DateKey,
): CategoryChange[] {
  const span = yearSpan(year, today);
  return span ? categoryChangesBetween(data, span) : [];
}

/** How much each category moved net worth over a span, biggest gain first. */
export function categoryChangesBetween(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  span: Span,
): CategoryChange[] {
  const perAccount = seriesByAccount(data.snapshots);
  const signs = accountSigns(data.accounts, data.nwCategories);
  const byCategory = new Map<ID, Cents>();
  for (const account of data.accounts) {
    const points = perAccount.get(account.id);
    if (!points) continue;
    const c = changeBetween(new Map([[account.id, points]]), signs, span.from, span.to);
    if (c?.change) byCategory.set(account.categoryId, (byCategory.get(account.categoryId) ?? 0) + c.change);
  }
  return data.nwCategories
    .filter((category) => byCategory.get(category.id))
    .map((category) => ({ category, change: byCategory.get(category.id)! }))
    .sort((a, b) => b.change - a.change);
}

/** What was owed at the start of a year (or when a debt was first entered) and at its end or today. */
export function debtYear(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  year: number,
  today: DateKey,
): { start: Cents; end: Cents } | null {
  const span = yearSpan(year, today);
  return span ? debtBetween(data, span) : null;
}

/** What was owed at the start of a span (or when a debt was first entered) and at its end. */
export function debtBetween(
  data: Pick<Data, 'accounts' | 'snapshots' | 'nwCategories'>,
  span: Span,
): { start: Cents; end: Cents } | null {
  const signs = accountSigns(data.accounts, data.nwCategories);
  const debts = new Map([...seriesByAccount(data.snapshots)].filter(([id]) => signs.get(id) === -1));
  const owed = changeBetween(debts, new Map([...debts.keys()].map((id) => [id, 1])), span.from, span.to);
  return owed && (owed.start > 0 || owed.end > 0) ? { start: owed.start, end: owed.end } : null;
}

export interface CategorySpend {
  category: SpendCategory;
  total: Cents;
  /** Per month counted. */
  monthly: Cents;
  /** Share of all spending. */
  share: number;
}

/** Spending over a year or a few months. */
export interface SpendingYear {
  /** How many months are counted (see `spendingYear`). */
  months: number;
  /** Average spent a month. */
  monthly: Cents;
  /** Each month's spending, in the order asked for, or null where it isn't counted. */
  spent: (Cents | null)[];
  /** What wasn't spent, out of what was earned, over counted months with income. Null without income. */
  rate: number | null;
  /** Each counted month's rate, or null. */
  rates: (number | null)[];
  /** Spending categories, biggest first. */
  categories: CategorySpend[];
}

/**
 * A year of spending, from Spending alone. Months count once they're over: a
 * month still going (or one ahead) is left out unless nothing else has been
 * entered yet, so a half-entered month doesn't skew the averages.
 */
export function spendingYear(
  data: Pick<Data, 'spend' | 'spendCategories'>,
  year: number,
  today: DateKey,
): SpendingYear | null {
  const summary = yearSummary(data, year);
  const t = parseDateKey(today);
  const entered = summary.months.flatMap((m, i) => (m.hasData ? [i] : []));
  const over = entered.filter((i) => year < t.y || (year === t.y && i + 1 < t.m));
  return summarize(data, summary.months, new Set(over.length ? over : entered));
}

/** Spending over the given months, counting the ones with something entered. Null when none has. */
export function spendingMonths(data: Pick<Data, 'spend' | 'spendCategories'>, list: Month[]): SpendingYear | null {
  const categories = new Map(data.spendCategories.map((c) => [c.id, c]));
  const months = list.map(({ year, month }) => {
    const key = monthKey(year, month);
    return { ...monthTotals(data.spend[key], categories), key };
  });
  return summarize(data, months, new Set(months.flatMap((m, i) => (m.hasData ? [i] : []))));
}

/** Totals over the counted months (by index), with each month's figures in order. */
function summarize(
  data: Pick<Data, 'spend' | 'spendCategories'>,
  all: (MonthTotals & { key: MonthKey })[],
  counted: Set<number>,
): SpendingYear | null {
  if (!counted.size) return null;
  const months = all.filter((_, i) => counted.has(i));
  const earned = earnedTotals(months);

  const totals = new Map<ID, Cents>();
  for (const m of months) {
    for (const [id, amount] of Object.entries(data.spend[m.key] ?? {})) {
      totals.set(id, (totals.get(id) ?? 0) + amount);
    }
  }
  const spentTotal = months.reduce((sum, m) => sum + m.expenses, 0);
  const ranked = (groups: SpendGroup[], whole: Cents) =>
    data.spendCategories
      .filter((c) => groups.includes(c.group) && (totals.get(c.id) ?? 0) > 0)
      .map((category) => {
        const total = totals.get(category.id)!;
        return { category, total, monthly: Math.round(total / counted.size), share: whole ? total / whole : 0 };
      })
      .sort((a, b) => b.total - a.total);
  const categories = ranked(['recurring', 'variable'], spentTotal);

  return {
    months: counted.size,
    monthly: Math.round(spentTotal / counted.size),
    spent: all.map((m, i) => (counted.has(i) ? m.expenses : null)),
    rate: savingsRate(earned),
    rates: all.map((m, i) => (counted.has(i) ? savingsRate(m) : null)),
    categories,
  };
}

/** The first year anything was entered, in either tracker. */
export function firstYear(data: Pick<Data, 'snapshots' | 'spend'>): number | null {
  let first: number | null = null;
  const consider = (y: number) => {
    if (first == null || y < first) first = y;
  };
  for (const s of data.snapshots) consider(parseDateKey(s.date).y);
  for (const [key, entries] of Object.entries(data.spend)) {
    if (Object.values(entries).some(Boolean)) consider(parseMonthKey(key).year);
  }
  return first;
}
