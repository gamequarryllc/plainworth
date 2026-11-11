import { dayNumber, formatDate, keyFromDayNumber, MONTHS_SHORT, parseDateKey } from './dates';
import { holdingsOn, netWorthMonths, netWorthYear, valueAt, type Month } from './insights';
import { currencyDecimals, currencySymbol, formatMoney } from './money';
import { compareSnapshots, kindOf, seriesByAccount } from './networth';
import { GROUPS, savedCash, yearSummary, yearsWithData } from './spending';
import type { Account, Cents, Data, DateKey } from './types';
import { buildWorkbook, excelDate, moneyFormat, type Cell, type Sheet, type Style } from './xlsx';

/**
 * Everything in one Excel workbook: an Overview page, net worth by month,
 * every balance entered, and a sheet for each year of spending laid out like
 * a budget spreadsheet. Styled in Plainworth's colors (the app icon's navy
 * and green), written straight into the cells so it looks the same in Excel,
 * Numbers and Google Sheets.
 */
export function exportWorkbook(data: Data, today: DateKey): Uint8Array {
  const currency = data.settings.currency;
  return buildWorkbook(exportSheets(data, today), moneyFormat(currencySymbol(currency), currencyDecimals(currency)));
}

/** `profile` is the open profile's name, given when there's more than one so the files can be told apart. */
export function exportFileName(today: DateKey, profile?: string): string {
  // Characters a file name can't have, on a phone or a computer.
  const name = (profile ?? '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `Plainworth ${name ? `${name} ` : ''}${today}.xlsx`;
}

export function exportSheets(data: Data, today: DateKey): Sheet[] {
  const years = yearsWithData(data.spend).reverse();
  return [
    overviewSheet(data, today),
    netWorthSheet(data, today),
    balancesSheet(data),
    ...years.map((y) => spendingSheet(data, y)),
  ];
}

/** What's in the file, for the export screen: "18 months", "292 entries". */
export function exportContents(data: Data, today: DateKey): { name: string; detail: string }[] {
  const months = netWorthMonthList(data, today).length;
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  return [
    { name: 'Overview', detail: 'Your totals at a glance' },
    {
      name: 'Net Worth',
      detail: months ? plural(months, 'month') : 'No balances yet',
    },
    {
      name: 'Balances',
      detail: data.snapshots.length ? plural(data.snapshots.length, 'entry', 'entries') : 'None yet',
    },
    ...yearsWithData(data.spend)
      .reverse()
      .map((y) => ({
        name: `Spending ${y}`,
        detail: plural(yearSummary(data, y).monthsWithData, 'month'),
      })),
  ];
}

// The app icon's colors.
const NAVY = '18202F';
const GREEN = '1E8F46';
const BRIGHT_GREEN = '5EE38A';
const DARK_GREEN = '146C34';
const MINT = 'E6F6EB';
const BAND = 'F5F6F8';
const GRAY = '6A7280';
const RULE = '9AA3B0';
const RED = 'C0392B';
const WHITE = 'FFFFFF';

const S = {
  header: { bold: true, color: WHITE, fill: NAVY } as Style,
  headerNumber: {
    bold: true,
    color: WHITE,
    fill: NAVY,
    align: 'right',
  } as Style,
  section: { bold: true, color: DARK_GREEN, fill: MINT } as Style,
  muted: { color: GRAY } as Style,
  money: { format: 'money' } as Style,
  totalLabel: { bold: true, top: 'thin', borderColor: RULE } as Style,
  total: {
    bold: true,
    format: 'money',
    top: 'thin',
    borderColor: RULE,
  } as Style,
  grandLabel: { bold: true, color: WHITE, fill: NAVY } as Style,
  grand: {
    bold: true,
    color: BRIGHT_GREEN,
    fill: NAVY,
    format: 'money',
  } as Style,
  percent: { format: 'percent' } as Style,
  date: { format: 'date' } as Style,
};

const cell = (value: string | number | null | undefined, style: Style): Cell =>
  value == null ? { value: '', style } : { value, style };
const amount = (cents: Cents | null | undefined, style: Style = S.money): Cell =>
  cell(cents == null ? null : cents / 100, style);
/** A gain in green with a +, a drop in red. */
const change = (cents: Cents | null | undefined, bold = true): Cell =>
  cents == null
    ? null
    : {
        value: cents / 100,
        style: { bold, format: 'signedMoney', color: cents < 0 ? RED : GREEN },
      };

/** A full-width row in one style: a header, a band, or a total. Blank cells keep the fill. */
function band(cells: Cell[], width: number, style: Style): Cell[] {
  return Array.from({ length: width }, (_, i) => {
    const c = cells[i];
    if (c == null || c === '') return { value: '', style };
    if (typeof c === 'object')
      return {
        value: c.value,
        style: {
          ...style,
          ...(typeof c.style === 'string' ? {} : c.style),
          ...(style.align && !(typeof c.style === 'object' && c.style.align) ? { align: style.align } : {}),
        },
      };
    return { value: c, style };
  });
}

/** Rows alternate white and light gray so long lines are easy to follow. */
function striped(cells: Cell[], width: number, index: number): Cell[] {
  return index % 2 === 1 ? band(cells, width, { fill: BAND }) : cells;
}

/** Accounts in the order of their categories, oldest first within each. */
function sortedAccounts(data: Data): Account[] {
  const order = new Map(data.nwCategories.map((c) => [c.id, c.order]));
  return [...data.accounts].sort(
    (a, b) => (order.get(a.categoryId) ?? 99) - (order.get(b.categoryId) ?? 99) || a.createdAt - b.createdAt,
  );
}

/** From the month of the first balance to this month (or a later one, if something was dated ahead). */
function netWorthMonthList(data: Data, today: DateKey): { label: string; day: number; year: number; month: number }[] {
  if (data.snapshots.length === 0) return [];
  const days = data.snapshots.map((s) => dayNumber(s.date));
  const firstDay = days.reduce((a, b) => Math.min(a, b));
  const lastDay = days.reduce((a, b) => Math.max(a, b), dayNumber(today));
  const from = parseDateKey(keyFromDayNumber(firstDay));
  const to = parseDateKey(keyFromDayNumber(lastDay));
  const months = [];
  for (let i = from.y * 12 + from.m - 1; i <= to.y * 12 + to.m - 1; i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    // Each month's last day; the month in progress shows the latest balances.
    const end = Math.round(Date.UTC(year, month, 0) / 86_400_000);
    months.push({
      label: `${MONTHS_SHORT[month - 1]} ${year}`,
      day: Math.min(end, lastDay),
      year,
      month,
    });
  }
  return months;
}

/**
 * The first page: net worth, how it changed this year, what was saved, the
 * savings rate, then net worth by category and each year of spending.
 */
function overviewSheet(data: Data, today: DateKey): Sheet {
  const t = parseDateKey(today);
  const currency = data.settings.currency;
  const rows: Cell[][] = [
    [{ value: 'Plainworth', style: { bold: true, size: 20, color: NAVY } }],
    [cell(`Exported ${formatDate(today)} · Amounts in ${currency}`, S.muted)],
    [],
  ];
  const heights: Record<number, number> = { 0: 30 };
  const width = 5;

  // Four figures across the top: label, number, a line under it.
  const tiles: { label: string; value: Cell; note: Cell }[] = [];
  const hasBalances = data.snapshots.length > 0;
  if (hasBalances) {
    const holdings = holdingsOn(data, dayNumber(today));
    const nw = holdings.assetTotal - holdings.debtTotal;
    tiles.push({
      label: 'NET WORTH',
      value: amount(nw, { bold: true, size: 16, format: 'money', color: NAVY }),
      note: cell(`As of ${formatDate(today)}`, S.muted),
    });
    const year = netWorthYear(data, t.y, today);
    if (year) {
      tiles.push({
        label: `CHANGE IN ${t.y}`,
        value: {
          value: year.change / 100,
          style: {
            bold: true,
            size: 16,
            format: 'signedMoney',
            color: year.change < 0 ? RED : GREEN,
          },
        },
        note: cell(
          year.ratio != null ? `${year.ratio < 0 ? '▼' : '▲'} ${Math.abs(year.ratio * 100).toFixed(1)}% this year` : '',
          { color: year.change < 0 ? RED : GREEN },
        ),
      });
    }
  }
  const summary = yearSummary(data, t.y);
  if (summary.monthsWithData > 0) {
    const kept = summary.net;
    const entered = summary.months.flatMap((m, i) => (m.hasData ? [i] : []));
    const span =
      entered.length > 1
        ? `${MONTHS_SHORT[entered[0]]} – ${MONTHS_SHORT[entered[entered.length - 1]]} ${t.y}`
        : `${MONTHS_SHORT[entered[0]]} ${t.y}`;
    tiles.push({
      label: `SAVED IN ${t.y}`,
      value: amount(kept, {
        bold: true,
        size: 16,
        format: 'money',
        color: NAVY,
      }),
      note: cell(
        summary.invested > 0 ? `${formatMoney(summary.invested, currency, { whole: true })} of it invested` : span,
        S.muted,
      ),
    });
    if (summary.savingsRate != null) {
      tiles.push({
        label: 'SAVINGS RATE',
        value: {
          value: round4(summary.savingsRate),
          style: { bold: true, size: 16, format: 'percent', color: NAVY },
        },
        note: cell(span, S.muted),
      });
    }
  }

  if (tiles.length) {
    const tile: Style = { fill: BAND, align: 'left' };
    rows.push(
      band(
        tiles.map((x) => cell(x.label, { bold: true, size: 9, color: GRAY })),
        width,
        tile,
      ),
    );
    rows.push(
      band(
        tiles.map((x) => x.value),
        width,
        tile,
      ),
    );
    rows.push(
      band(
        tiles.map((x) => x.note),
        width,
        tile,
      ),
    );
    heights[rows.length - 2] = 24;
    rows.push([]);
  } else {
    rows.push([cell('Nothing entered yet. Add an account or a month of spending, then export again.', S.muted)]);
  }

  if (hasBalances) {
    const holdings = holdingsOn(data, dayNumber(today));
    const bar = (share: number, color: string): Cell =>
      share > 0
        ? {
            value: '█'.repeat(Math.max(1, Math.round(share * 16))),
            style: { color },
          }
        : null;
    rows.push(
      band(
        [
          'Net Worth by Category',
          { value: 'Balance', style: { align: 'right' } },
          { value: 'Share', style: { align: 'right' } },
        ],
        width,
        S.header,
      ),
    );
    holdings.assets.forEach((h, i) =>
      rows.push(
        striped([h.category.name, amount(h.total), cell(round4(h.share), S.percent), bar(h.share, '30D158')], width, i),
      ),
    );
    if (holdings.debts.length) {
      rows.push(band(['Total Assets', amount(holdings.assetTotal, S.total)], width, S.totalLabel));
      holdings.debts.forEach((h, i) =>
        rows.push(
          striped(
            [
              h.category.name,
              amount(-h.total, { format: 'money', color: RED }),
              cell(round4(h.share), S.percent),
              bar(h.share, 'E57368'),
            ],
            width,
            i,
          ),
        ),
      );
      rows.push(band(['Total Debts', amount(-holdings.debtTotal, { ...S.total, color: RED })], width, S.totalLabel));
    }
    rows.push(band(['Net Worth', amount(holdings.assetTotal - holdings.debtTotal, S.grand)], width, S.grandLabel));
    rows.push([]);
  }

  const years = yearsWithData(data.spend).reverse();
  if (years.length) {
    rows.push(
      band(
        [
          'Spending by Year',
          ...['Earned', 'Spent', 'Invested', 'Savings Rate'].map((h) => ({
            value: h,
            style: { align: 'right' } as Style,
          })),
        ],
        width,
        S.header,
      ),
    );
    years.forEach((y, i) => {
      const s = yearSummary(data, y);
      rows.push(
        striped(
          [
            cell(
              s.monthsWithData < 12
                ? `${y} (${s.monthsWithData} ${s.monthsWithData === 1 ? 'month' : 'months'})`
                : String(y),
              {},
            ),
            amount(s.income),
            amount(s.expenses),
            amount(s.invested),
            s.savingsRate == null ? null : cell(round4(s.savingsRate), S.percent),
          ],
          width,
          i,
        ),
      );
    });
  }

  return {
    name: 'Overview',
    rows,
    heights,
    widths: [26, 20, 20, 20, 20],
    gridlines: false,
    tabColor: '30D158',
    print: 'portrait',
  };
}

/** One row per account, one column per month: the balance at the end of each month. */
function netWorthSheet(data: Data, today: DateKey): Sheet {
  const name = 'Net Worth';
  const months = netWorthMonthList(data, today);
  if (months.length === 0)
    return {
      name,
      rows: [[cell('Net Worth', { bold: true })], ['No balances entered yet.']],
    };
  const width = 2 + months.length;

  const cats = new Map(data.nwCategories.map((c) => [c.id, c]));
  const perAccount = seriesByAccount(data.snapshots);
  const rows: Cell[][] = [
    band(['Account', 'Category', ...months.map((m) => cell(m.label, S.headerNumber))], width, S.header),
  ];
  const totals = { asset: months.map(() => 0), liability: months.map(() => 0) };
  const seen = {
    asset: months.map(() => false),
    liability: months.map(() => false),
  };
  for (const kind of ['asset', 'liability'] as const) {
    const accounts = sortedAccounts(data).filter((a) => kindOf(a, cats) === kind);
    if (accounts.length === 0) continue;
    rows.push(band([kind === 'asset' ? 'Assets' : 'Debts'], width, S.section));
    accounts.forEach((account, index) => {
      const points = perAccount.get(account.id) ?? [];
      const values = months.map((m, i) => {
        const v = valueAt(points, m.day);
        if (v != null) {
          totals[kind][i] += v;
          seen[kind][i] = true;
        }
        return amount(v);
      });
      const label = account.closed ? `${account.name} (closed)` : account.name;
      rows.push(striped([label, cell(cats.get(account.categoryId)?.name ?? '', S.muted), ...values], width, index));
    });
    rows.push(
      band(
        [
          kind === 'asset' ? 'Total Assets' : 'Total Debts',
          null,
          ...totals[kind].map((t, i) => (seen[kind][i] ? amount(t, S.total) : null)),
        ],
        width,
        S.totalLabel,
      ),
    );
    rows.push([]);
  }
  rows.push(
    band(
      ['Net Worth', null, ...months.map((_, i) => amount(totals.asset[i] - totals.liability[i], S.grand))],
      width,
      S.grandLabel,
    ),
  );
  // How much it moved each month. A new account counts from its first balance, so adding one isn't growth.
  const list: Month[] = months.map((m) => ({ year: m.year, month: m.month }));
  const moves = netWorthMonths(data, list, keyFromDayNumber(months[months.length - 1].day))?.months ?? [];
  rows.push(['Change', null, ...months.map((_, i) => (i === 0 ? null : change(moves[i]?.change)))]);
  return {
    name,
    rows,
    widths: [26, 18, ...months.map(() => 13)],
    freeze: { rows: 1, columns: 2 },
    print: 'landscape',
  };
}

/** Every balance ever entered, oldest first. */
function balancesSheet(data: Data): Sheet {
  const cats = new Map(data.nwCategories.map((c) => [c.id, c]));
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const units = data.accounts.some((a) => a.unit);
  const header: Cell[] = [
    'Date',
    'Account',
    'Category',
    'Type',
    cell('Balance', S.headerNumber),
    ...(units ? [cell('Quantity', S.headerNumber), 'Unit', cell('Price', S.headerNumber)] : []),
    'Note',
  ];
  const width = header.length;
  const rows: Cell[][] = [band(header, width, S.header)];
  [...data.snapshots].sort(compareSnapshots).forEach((s) => {
    const account = accounts.get(s.accountId);
    if (!account) return;
    rows.push(
      striped(
        [
          cell(excelDate(dayNumber(s.date)), S.date),
          account.name,
          cell(cats.get(account.categoryId)?.name ?? '', S.muted),
          kindOf(account, cats) === 'asset' ? 'Asset' : 'Debt',
          amount(s.value),
          ...(units
            ? [s.quantity ?? null, s.quantity != null ? (account.unit ?? null) : null, amount(s.unitPrice)]
            : []),
          s.note ?? null,
        ],
        width,
        rows.length - 1,
      ),
    );
  });
  return {
    name: 'Balances',
    rows,
    widths: [13, 26, 18, 8, 14, ...(units ? [10, 7, 12] : []), 30],
    freeze: { rows: 1 },
    print: 'portrait',
  };
}

/** A year of spending: categories down the side, months across, with totals. */
function spendingSheet(data: Data, year: number): Sheet {
  const summary = yearSummary(data, year);
  const entered = summary.monthsWithData;
  const width = 15;
  const average = (total: number) => (entered ? Math.round(total / entered) : null);
  const monthly = (f: (i: number) => Cents | null, style: Style = S.money, totalStyle: Style = S.total): Cell[] => {
    let total = 0;
    const cells = summary.months.map((m, i) => {
      const v = m.hasData ? f(i) : null;
      if (v != null) total += v;
      return amount(v, negative(v, style));
    });
    return [
      ...cells,
      amount(total, negative(total, { ...S.money, ...totalStyle, bold: true })),
      amount(average(total), negative(average(total), style)),
    ];
  };

  const rows: Cell[][] = [
    band(
      [String(year), ...[...MONTHS_SHORT, 'Total', 'Monthly Average'].map((m) => cell(m, S.headerNumber))],
      width,
      S.header,
    ),
  ];
  for (const group of GROUPS) {
    const categories = data.spendCategories
      .filter((c) => c.group === group.key && (!c.hidden || summary.months.some((m) => !!data.spend[m.key]?.[c.id])))
      .sort((a, b) => a.order - b.order);
    if (categories.length === 0) continue;
    rows.push(band([group.title], width, S.section));
    categories.forEach((c, i) => {
      rows.push(
        striped(
          [c.name, ...monthly((m) => data.spend[summary.months[m].key]?.[c.id] || null, S.money, { bold: true })],
          width,
          i,
        ),
      );
    });
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
    rows.push(band([`Total ${group.title}`, ...monthly(subtotal, S.total)], width, S.totalLabel));
    rows.push([]);
  }

  rows.push(band(['Summary'], width, S.section));
  const lines: [string, (i: number) => Cents][] = [
    ['Earned', (i) => summary.months[i].income],
    ['Spent (Recurring + Spending)', (i) => summary.months[i].expenses],
  ];
  if (summary.invested > 0) lines.push(['Invested', (i) => summary.months[i].invested]);
  lines.forEach(([label, f], i) => rows.push(striped([label, ...monthly(f, S.money, { bold: true })], width, i)));
  rows.push(band(['Saved', ...monthly((i) => savedCash(summary.months[i]), S.grand, S.grand)], width, S.grandLabel));
  const rate = (r: number | null, strong = false): Cell =>
    r == null ? null : cell(round4(r), { format: 'percent', bold: strong });
  rows.push([
    'Savings Rate (Saved + Invested)',
    ...summary.months.map((m) => rate(m.income > 0 ? m.net / m.income : null)),
    rate(summary.savingsRate, true),
  ]);
  const notes = summary.months.map((m) => data.monthNotes[m.key]?.trim() || null);
  if (notes.some(Boolean)) rows.push(['Notes', ...notes.map((n) => (n ? cell(n, S.muted) : null))]);

  return {
    name: `Spending ${year}`,
    rows,
    widths: [30, ...MONTHS_SHORT.map(() => 11), 12, 16],
    freeze: { rows: 1, columns: 1 },
    print: 'landscape',
  };
}

/** On the navy Saved row, a month that went backwards shows in a light red. */
function negative(cents: Cents | null, style: Style): Style {
  return cents != null && cents < 0 && style.fill === NAVY ? { ...style, color: 'FF8A80' } : style;
}

const round4 = (r: number) => Math.round(r * 10_000) / 10_000;
