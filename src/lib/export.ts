import { dayNumber, keyFromDayNumber, MONTHS_SHORT, parseDateKey } from './dates';
import { valueAt } from './insights';
import { currencyDecimals, currencySymbol } from './money';
import { compareSnapshots, kindOf, seriesByAccount } from './networth';
import { GROUPS, savedCash, yearSummary, yearsWithData } from './spending';
import type { Account, Cents, Data, DateKey } from './types';
import { buildWorkbook, excelDate, moneyFormat, type Cell, type Sheet } from './xlsx';

/**
 * Everything in one Excel workbook: net worth by month, every balance entered,
 * and a sheet for each year of spending laid out like a budget spreadsheet.
 */
export function exportWorkbook(data: Data, today: DateKey): Uint8Array {
  const currency = data.settings.currency;
  return buildWorkbook(exportSheets(data, today), moneyFormat(currencySymbol(currency), currencyDecimals(currency)));
}

export function exportFileName(today: DateKey): string {
  return `Plainworth ${today}.xlsx`;
}

export function exportSheets(data: Data, today: DateKey): Sheet[] {
  const years = yearsWithData(data.spend).reverse();
  return [netWorthSheet(data, today), balancesSheet(data), ...years.map((y) => spendingSheet(data, y))];
}

const bold = (value: string): Cell => ({ value, style: 'bold' });
/** Header over a column of numbers. */
const heading = (value: string): Cell => ({ value, style: 'heading' });
const amount = (cents: Cents | null | undefined, strong = false): Cell =>
  cents == null ? null : { value: cents / 100, style: strong ? 'moneyBold' : 'money' };

/** Accounts in the order of their categories, oldest first within each. */
function sortedAccounts(data: Data): Account[] {
  const order = new Map(data.nwCategories.map((c) => [c.id, c.order]));
  return [...data.accounts].sort(
    (a, b) => (order.get(a.categoryId) ?? 99) - (order.get(b.categoryId) ?? 99) || a.createdAt - b.createdAt,
  );
}

/** One row per account, one column per month: the balance at the end of each month. */
function netWorthSheet(data: Data, today: DateKey): Sheet {
  const name = 'Net Worth';
  if (data.snapshots.length === 0) return { name, rows: [[bold('Net Worth')], ['No balances entered yet.']] };
  // From the month of the first balance to this month (or a later one, if something was dated ahead).
  const days = data.snapshots.map((s) => dayNumber(s.date));
  const firstDay = days.reduce((a, b) => Math.min(a, b));
  const lastDay = days.reduce((a, b) => Math.max(a, b), dayNumber(today));
  const from = parseDateKey(keyFromDayNumber(firstDay));
  const to = parseDateKey(keyFromDayNumber(lastDay));
  const months: { label: string; day: number }[] = [];
  for (let i = from.y * 12 + from.m - 1; i <= to.y * 12 + to.m - 1; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    // Each month's last day; the month in progress shows the latest balances.
    const end = Math.round(Date.UTC(y, m, 0) / 86_400_000);
    months.push({ label: `${MONTHS_SHORT[m - 1]} ${y}`, day: Math.min(end, lastDay) });
  }

  const cats = new Map(data.nwCategories.map((c) => [c.id, c]));
  const perAccount = seriesByAccount(data.snapshots);
  const rows: Cell[][] = [[bold('Account'), bold('Category'), ...months.map((m) => heading(m.label))]];
  const totals = { asset: months.map(() => 0), liability: months.map(() => 0) };
  const seen = { asset: months.map(() => false), liability: months.map(() => false) };
  for (const kind of ['asset', 'liability'] as const) {
    const accounts = sortedAccounts(data).filter((a) => kindOf(a, cats) === kind);
    if (accounts.length === 0) continue;
    rows.push([bold(kind === 'asset' ? 'Assets' : 'Debts')]);
    for (const account of accounts) {
      const points = perAccount.get(account.id) ?? [];
      const values = months.map((m, i) => {
        const v = valueAt(points, m.day);
        if (v != null) {
          totals[kind][i] += v;
          seen[kind][i] = true;
        }
        return amount(v);
      });
      rows.push([account.closed ? `${account.name} (closed)` : account.name, cats.get(account.categoryId)?.name ?? '', ...values]);
    }
    rows.push([
      bold(kind === 'asset' ? 'Total Assets' : 'Total Debts'),
      null,
      ...totals[kind].map((t, i) => (seen[kind][i] ? amount(t, true) : null)),
    ]);
    rows.push([]);
  }
  rows.push([
    bold('Net Worth'),
    null,
    ...months.map((_, i) => amount(totals.asset[i] - totals.liability[i], true)),
  ]);
  return { name, rows, widths: [26, 18, ...months.map(() => 13)], freeze: { rows: 1, columns: 2 } };
}

/** Every balance ever entered, oldest first. */
function balancesSheet(data: Data): Sheet {
  const cats = new Map(data.nwCategories.map((c) => [c.id, c]));
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const units = data.accounts.some((a) => a.unit);
  const header = [
    bold('Date'),
    bold('Account'),
    bold('Category'),
    bold('Type'),
    heading('Balance'),
    ...(units ? [heading('Quantity'), bold('Unit'), heading('Price')] : []),
    bold('Note'),
  ];
  const rows: Cell[][] = [header];
  for (const s of [...data.snapshots].sort(compareSnapshots)) {
    const account = accounts.get(s.accountId);
    if (!account) continue;
    rows.push([
      { value: excelDate(dayNumber(s.date)), style: 'date' },
      account.name,
      cats.get(account.categoryId)?.name ?? '',
      kindOf(account, cats) === 'asset' ? 'Asset' : 'Debt',
      amount(s.value),
      ...(units ? [s.quantity ?? null, s.quantity != null ? (account.unit ?? null) : null, amount(s.unitPrice)] : []),
      s.note ?? null,
    ]);
  }
  return {
    name: 'Balances',
    rows,
    widths: [13, 26, 18, 8, 14, ...(units ? [10, 7, 12] : []), 30],
    freeze: { rows: 1 },
  };
}

/** A year of spending: categories down the side, months across, with totals. */
function spendingSheet(data: Data, year: number): Sheet {
  const summary = yearSummary(data, year);
  const entered = summary.monthsWithData;
  const average = (total: number) => (entered ? Math.round(total / entered) : null);
  const monthly = (f: (i: number) => Cents | null, strong = false): Cell[] => {
    let total = 0;
    const cells = summary.months.map((m, i) => {
      const v = m.hasData ? f(i) : null;
      if (v != null) total += v;
      return amount(v, strong);
    });
    return [...cells, amount(total, true), amount(average(total), strong)];
  };

  const rows: Cell[][] = [[bold(String(year)), ...MONTHS_SHORT.map(heading), heading('Total'), heading('Monthly Average')]];
  for (const group of GROUPS) {
    const categories = data.spendCategories
      .filter(
        (c) =>
          c.group === group.key &&
          (!c.hidden || summary.months.some((m) => !!data.spend[m.key]?.[c.id])),
      )
      .sort((a, b) => a.order - b.order);
    if (categories.length === 0) continue;
    rows.push([bold(group.title)]);
    for (const c of categories) {
      rows.push([c.name, ...monthly((i) => data.spend[summary.months[i].key]?.[c.id] || null)]);
    }
    const subtotal = (i: number) => {
      const m = summary.months[i];
      return group.key === 'recurring'
        ? m.recurring
        : group.key === 'variable'
          ? m.variable
          : group.key === 'invest'
            ? m.invested
            : m.income;
    };
    rows.push([bold(`Total ${group.title}`), ...monthly(subtotal, true)]);
    rows.push([]);
  }

  rows.push([bold('Summary')]);
  rows.push(['Earned', ...monthly((i) => summary.months[i].income)]);
  rows.push(['Spent (Recurring + Spending)', ...monthly((i) => summary.months[i].expenses)]);
  if (summary.invested > 0) rows.push(['Invested', ...monthly((i) => summary.months[i].invested)]);
  rows.push(['Saved', ...monthly((i) => savedCash(summary.months[i]))]);
  const rate = (r: number | null, strong = false): Cell =>
    r == null ? null : { value: Math.round(r * 10_000) / 10_000, style: strong ? 'percentBold' : 'percent' };
  rows.push([
    'Savings Rate (Saved + Invested)',
    ...summary.months.map((m) => rate(m.income > 0 ? m.net / m.income : null)),
    rate(summary.savingsRate, true),
  ]);
  const notes = summary.months.map((m) => data.monthNotes[m.key]?.trim() || null);
  if (notes.some(Boolean)) rows.push(['Notes', ...notes]);

  return {
    name: `Spending ${year}`,
    rows,
    widths: [30, ...MONTHS_SHORT.map(() => 11), 12, 16],
    freeze: { rows: 1, columns: 1 },
  };
}
