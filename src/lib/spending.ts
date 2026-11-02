import { monthKey, parseMonthKey } from './dates';
import type { Cents, Data, ID, MonthKey, SpendCategory, SpendGroup } from './types';

export interface MonthTotals {
  recurring: Cents;
  variable: Cents;
  /** Recurring plus spending. Money invested isn't counted here. */
  expenses: Cents;
  invested: Cents;
  income: Cents;
  /** Income minus expenses: everything kept, invested or not. */
  net: Cents;
  hasData: boolean;
}

export const GROUPS: { key: SpendGroup; title: string; singular: string }[] = [
  { key: 'recurring', title: 'Recurring', singular: 'Recurring expense' },
  { key: 'variable', title: 'Spending', singular: 'Spending category' },
  { key: 'invest', title: 'Invested', singular: 'Investment' },
  { key: 'income', title: 'Income', singular: 'Income source' },
];

export function groupTitle(group: SpendGroup): string {
  return GROUPS.find((g) => g.key === group)?.title ?? group;
}

export function monthTotals(
  entries: Record<ID, Cents> | undefined,
  categories: Map<ID, SpendCategory>,
): MonthTotals {
  const t: MonthTotals = { recurring: 0, variable: 0, expenses: 0, invested: 0, income: 0, net: 0, hasData: false };
  if (!entries) return t;
  for (const [catId, amount] of Object.entries(entries)) {
    const cat = categories.get(catId);
    if (!cat || !amount) continue;
    t.hasData = true;
    if (cat.group === 'income') t.income += amount;
    else if (cat.group === 'invest') t.invested += amount;
    else if (cat.group === 'recurring') t.recurring += amount;
    else t.variable += amount;
  }
  t.expenses = t.recurring + t.variable;
  t.net = t.income - t.expenses;
  return t;
}

/** What was kept as plain savings once investing is taken out. Below zero means investing dipped into savings. */
export function savedCash(m: Pick<MonthTotals, 'net' | 'invested'>): Cents {
  return m.net - m.invested;
}

export interface YearSummary {
  year: number;
  months: (MonthTotals & { key: MonthKey })[];
  income: Cents;
  expenses: Cents;
  invested: Cents;
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
  let invested = 0;
  let monthsWithData = 0;
  for (const m of months) {
    income += m.income;
    expenses += m.expenses;
    invested += m.invested;
    if (m.hasData) monthsWithData++;
  }
  const net = income - expenses;
  return {
    year,
    months,
    income,
    expenses,
    invested,
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
export function earnedTotals(months: MonthTotals[]): Pick<MonthTotals, 'income' | 'expenses' | 'invested' | 'net'> {
  const t = { income: 0, expenses: 0, invested: 0, net: 0 };
  for (const m of months) {
    if (m.income <= 0) continue;
    t.income += m.income;
    t.expenses += m.expenses;
    t.invested += m.invested;
    t.net += m.net;
  }
  return t;
}

/** Share of income kept, saved or invested. Null without income. */
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

/** Categories to show for a month: visible ones, plus hidden ones that have a value that month. */
export function categoriesForMonth(
  categories: SpendCategory[],
  entries: Record<ID, Cents> | undefined,
  group: SpendGroup,
): SpendCategory[] {
  return categories
    .filter((c) => c.group === group && (!c.hidden || !!entries?.[c.id]))
    .sort((a, b) => a.order - b.order);
}
