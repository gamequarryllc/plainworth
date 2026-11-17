import { monthKey, parseMonthKey } from './dates';
import type { Cents, Data, ID, MonthKey, SpendCategory, SpendGroup } from './types';

export interface MonthTotals {
  recurring: Cents;
  variable: Cents;
  /** Recurring plus spending. */
  expenses: Cents;
  income: Cents;
  /** Income minus expenses: what was saved. */
  net: Cents;
  hasData: boolean;
}

export const GROUPS: { key: SpendGroup; title: string; singular: string }[] = [
  { key: 'recurring', title: 'Recurring', singular: 'Recurring expense' },
  { key: 'variable', title: 'Spending', singular: 'Spending category' },
  { key: 'income', title: 'Income', singular: 'Income source' },
];

export function groupTitle(group: SpendGroup): string {
  return GROUPS.find((g) => g.key === group)?.title ?? group;
}

export function monthTotals(
  entries: Record<ID, Cents> | undefined,
  categories: Map<ID, SpendCategory>,
): MonthTotals {
  const t: MonthTotals = { recurring: 0, variable: 0, expenses: 0, income: 0, net: 0, hasData: false };
  if (!entries) return t;
  for (const [catId, amount] of Object.entries(entries)) {
    const cat = categories.get(catId);
    if (!cat || !amount) continue;
    t.hasData = true;
    if (cat.group === 'income') t.income += amount;
    else if (cat.group === 'recurring') t.recurring += amount;
    else t.variable += amount;
  }
  t.expenses = t.recurring + t.variable;
  t.net = t.income - t.expenses;
  return t;
}

export interface YearSummary {
  year: number;
  months: (MonthTotals & { key: MonthKey })[];
  income: Cents;
  expenses: Cents;
  net: Cents;
  monthsWithData: number;
  avgExpenses: Cents;
  savingsRate: number | null;
}

export function yearSummary(data: Pick<Data, 'spend' | 'spendCategories'>, year: number): YearSummary {
  const cats = new Map(data.spendCategories.map((c) => [c.id, c]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(year, i + 1);
    return { key, ...monthTotals(data.spend[key], cats) };
  });
  let income = 0;
  let expenses = 0;
  let monthsWithData = 0;
  for (const m of months) {
    income += m.income;
    expenses += m.expenses;
    if (m.hasData) monthsWithData++;
  }
  const net = income - expenses;
  return {
    year,
    months,
    income,
    expenses,
    net,
    monthsWithData,
    avgExpenses: monthsWithData ? Math.round(expenses / monthsWithData) : 0,
    savingsRate: savingsRate(earnedTotals(months)),
  };
}

/**
 * Totals over the months that have income entered. A month whose paycheck isn't
 * in yet would otherwise count all of its spending against what was saved.
 */
export function earnedTotals(months: MonthTotals[]): Pick<MonthTotals, 'income' | 'expenses' | 'net'> {
  const t = { income: 0, expenses: 0, net: 0 };
  for (const m of months) {
    if (m.income <= 0) continue;
    t.income += m.income;
    t.expenses += m.expenses;
    t.net += m.net;
  }
  return t;
}

/** Share of income saved. Null without income. */
export function savingsRate(t: Pick<MonthTotals, 'income' | 'net'>): number | null {
  return t.income > 0 ? t.net / t.income : null;
}

export interface CategoryTotal {
  category: SpendCategory;
  total: Cents;
  share: number;
}

/** Yearly totals per category for the given groups, largest first. */
export function categoryTotals(
  data: Pick<Data, 'spend' | 'spendCategories'>,
  year: number,
  groups: SpendGroup[],
): CategoryTotal[] {
  const totals = new Map<ID, Cents>();
  for (let m = 1; m <= 12; m++) {
    const entries = data.spend[monthKey(year, m)];
    if (!entries) continue;
    for (const [id, amount] of Object.entries(entries)) {
      totals.set(id, (totals.get(id) ?? 0) + amount);
    }
  }
  const rows = data.spendCategories
    .filter((c) => groups.includes(c.group))
    .map((category) => ({ category, total: totals.get(category.id) ?? 0, share: 0 }))
    .filter((r) => r.total > 0);
  const sum = rows.reduce((acc, r) => acc + r.total, 0);
  for (const r of rows) r.share = sum ? r.total / sum : 0;
  return rows.sort((a, b) => b.total - a.total);
}

export function yearsWithData(spend: Data['spend']): number[] {
  const years = new Set<number>();
  for (const [key, entries] of Object.entries(spend)) {
    if (Object.values(entries).some(Boolean)) years.add(parseMonthKey(key).year);
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * Categories to show for a month: visible ones, plus hidden ones that have a
 * value that month (or are in `keep`, so a row being typed in doesn't vanish).
 */
export function categoriesForMonth(
  categories: SpendCategory[],
  entries: Record<ID, Cents> | undefined,
  group: SpendGroup,
  keep?: ReadonlySet<ID>,
): SpendCategory[] {
  return categories
    .filter((c) => c.group === group && (!c.hidden || !!entries?.[c.id] || !!keep?.has(c.id)))
    .sort((a, b) => a.order - b.order);
}

/**
 * Folds spending categories that share a name (ignoring case and spaces) into
 * one, adding their amounts together month by month. Older versions could end
 * up with two "Travel"s, one holding the past amounts and one empty, so past
 * months looked like $0. The one used in the most months (then the oldest) is kept, with its
 * group; it stays hidden only if every copy was hidden. Returns null when
 * there's nothing to fold.
 */
export function mergeSameNames(
  data: Pick<Data, 'spendCategories' | 'spend'>,
): Pick<Data, 'spendCategories' | 'spend'> | null {
  const byName = new Map<string, SpendCategory[]>();
  for (const c of data.spendCategories) {
    const key = c.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }
  const groups = [...byName.values()].filter((list) => list.length > 1);
  if (!groups.length) return null;
  const used = (id: ID) => Object.values(data.spend).filter((entries) => !!entries[id]).length;
  const first = (id: ID) =>
    Object.keys(data.spend)
      .filter((m) => !!data.spend[m][id])
      .sort()[0] ?? '9999';
  const into = new Map<ID, ID>();
  const keepers = new Map<ID, SpendCategory>();
  for (const list of groups) {
    const ranked = [...list].sort(
      (a, b) =>
        used(b.id) - used(a.id) ||
        (first(a.id) < first(b.id) ? -1 : first(a.id) > first(b.id) ? 1 : 0) ||
        Number(a.hidden) - Number(b.hidden) ||
        a.order - b.order ||
        (a.id < b.id ? -1 : 1),
    );
    const keeper = ranked[0];
    keepers.set(keeper.id, { ...keeper, hidden: list.every((c) => c.hidden) });
    for (const c of ranked.slice(1)) into.set(c.id, keeper.id);
  }
  const spendCategories = data.spendCategories
    .filter((c) => !into.has(c.id))
    .map((c) => keepers.get(c.id) ?? c);
  const spend: Data['spend'] = {};
  for (const [month, entries] of Object.entries(data.spend)) {
    const next: Record<ID, Cents> = {};
    for (const [id, amount] of Object.entries(entries)) {
      const to = into.get(id) ?? id;
      next[to] = (next[to] ?? 0) + amount;
    }
    spend[month] = next;
  }
  return { spendCategories, spend };
}
