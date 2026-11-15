import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  categoryChangesBetween,
  debtBetween,
  firstYear,
  growingMix,
  holdingsOn,
  incomeYears,
  monthsLabel,
  monthsSpan,
  netWorthMonths,
  netWorthYear,
  recentMonths,
  shownYear,
  spendingMonths,
  spendingYear,
  spendingYears,
  valueAt,
  yearSpan,
} from '../insights';
import { dayNumber } from '../dates';
import type { Account, NWCategory, Snapshot, SpendCategory } from '../types';

const nwCategories: NWCategory[] = [
  { id: 'cash', name: 'Cash', kind: 'asset', order: 0 },
  { id: 'stocks', name: 'Investments', kind: 'asset', order: 1 },
  { id: 'loan', name: 'Loans', kind: 'liability', order: 2 },
];
const accounts: Account[] = [
  { id: 'a', name: 'Savings', categoryId: 'cash', createdAt: 0, closed: false },
  { id: 'b', name: 'Brokerage', categoryId: 'stocks', createdAt: 0, closed: false },
  { id: 'c', name: 'Car loan', categoryId: 'loan', createdAt: 0, closed: false },
];
let n = 0;
const snap = (accountId: string, date: string, value: number): Snapshot => ({ id: String(++n), accountId, date, value, createdAt: n });
const snapshots: Snapshot[] = [
  snap('a', '2025-12-20', 1_000_00),
  snap('c', '2025-12-20', 500_00),
  snap('a', '2026-01-15', 1_200_00),
  snap('c', '2026-02-10', 400_00),
  // Added in March: its first balance isn't growth.
  snap('b', '2026-03-05', 10_000_00),
  snap('b', '2026-03-25', 10_500_00),
  snap('a', '2026-04-02', 900_00),
];
const nw = { accounts, snapshots, nwCategories };

test('insights: a value on a day is the latest one before it', () => {
  const points = [
    { day: 10, value: 1 },
    { day: 20, value: 2 },
  ];
  assert.equal(valueAt(points, 9), undefined);
  assert.equal(valueAt(points, 10), 1);
  assert.equal(valueAt(points, 19), 1);
  assert.equal(valueAt(points, 25), 2);
});

test('insights: net worth for a year, month by month', () => {
  const year = netWorthYear(nw, 2026, '2026-05-10')!;
  // Going in: 1,000 − 500. The brokerage counts from its first balance.
  assert.equal(year.start, 500_00 + 10_000_00);
  assert.equal(year.end, 900_00 + 10_500_00 - 400_00);
  // Savings down 100, the loan down 100, the brokerage up 500.
  assert.equal(year.change, -100_00 + 100_00 + 500_00);
  assert.deepEqual(
    year.months.map((m) => m?.change ?? null),
    [200_00, 100_00, 500_00, -300_00, 0, null, null, null, null, null, null, null],
  );
  assert.ok(Math.abs(year.ratio! - 500_00 / 10_500_00) < 1e-9);
  // Before anything was entered, and a year still to come.
  assert.equal(netWorthYear(nw, 2024, '2026-05-10'), null);
  assert.equal(netWorthYear(nw, 2027, '2026-05-10'), null);
  // The year tracking started: only the days after the first balance count.
  const started = netWorthYear(nw, 2025, '2026-05-10')!;
  assert.equal(started.change, 0);
  assert.equal(started.months[10], null);
  assert.equal(started.months[11]!.end, 500_00);
});

test('insights: what was owned and owed on a day', () => {
  const h = holdingsOn(nw, dayNumber('2026-03-31'));
  assert.deepEqual(
    h.assets.map((x) => [x.category.id, x.total]),
    [
      ['stocks', 10_500_00],
      ['cash', 1_200_00],
    ],
  );
  assert.equal(h.assetTotal, 11_700_00);
  assert.equal(h.debtTotal, 400_00);
  assert.ok(Math.abs(h.assets[0].share - 10_500 / 11_700) < 1e-9);
  // Before the brokerage existed.
  assert.deepEqual(
    holdingsOn(nw, dayNumber('2026-01-31')).assets.map((x) => x.category.id),
    ['cash'],
  );
});

test('insights: balances below zero keep assets minus debts equal to net worth', () => {
  const data = {
    nwCategories,
    accounts,
    snapshots: [
      // Overdrawn by $200, $10,000 invested, and a loan overpaid by $50.
      snap('a', '2026-06-01', -200_00),
      snap('b', '2026-06-01', 10_000_00),
      snap('c', '2026-06-01', -50_00),
    ],
  };
  const h = holdingsOn(data, dayNumber('2026-06-30'));
  assert.deepEqual(h.assets.map((x) => x.category.id), ['stocks']);
  assert.equal(h.assetTotal, 10_000_00);
  // The overdraft is owed; the overpayment comes off what's owed.
  assert.equal(h.debtTotal, 200_00 - 50_00);
  assert.equal(h.assetTotal - h.debtTotal, -200_00 + 10_000_00 + 50_00);
});

test('insights: how much of what is owned is invested', () => {
  // A category someone made and named "Investments" counts, like the built-in one.
  const mix = growingMix(nw, dayNumber('2026-03-31'));
  assert.equal(mix.invested, 10_500_00);
  assert.ok(Math.abs(mix.share - 10_500 / 11_700) < 1e-9);
  // Called something that isn't investing, it holds its value like cash.
  const plain = { ...nw, nwCategories: nwCategories.map((c) => (c.id === 'stocks' ? { ...c, name: 'Collectibles' } : c)) };
  assert.deepEqual(growingMix(plain, dayNumber('2026-03-31')), { invested: 0, share: 0 });
  // The built-in Investments category grows whatever it's renamed to.
  const builtIn = {
    ...plain,
    nwCategories: plain.nwCategories.map((c) => (c.id === 'stocks' ? { ...c, id: 'investments' } : c)),
    accounts: accounts.map((a) => (a.categoryId === 'stocks' ? { ...a, categoryId: 'investments' } : a)),
  };
  assert.equal(growingMix(builtIn, dayNumber('2026-03-31')).invested, 10_500_00);
  // Nothing owned yet.
  assert.deepEqual(growingMix(nw, dayNumber('2025-01-01')), { invested: 0, share: 0 });
});

const spendCategories: SpendCategory[] = [
  { id: 'rent', name: 'Rent', group: 'recurring', order: 0, hidden: false },
  { id: 'food', name: 'Groceries', group: 'variable', order: 0, hidden: false },
  { id: 'fun', name: 'Fun', group: 'variable', order: 1, hidden: false },
  { id: 'pay', name: 'Paycheck', group: 'income', order: 0, hidden: false },
];
const spend = {
  '2025-01': { rent: 1_000_00, food: 300_00, pay: 2_000_00 },
  '2025-02': { rent: 1_000_00, food: 250_00, fun: 100_00, pay: 2_000_00 },
  '2025-03': { rent: 1_000_00, food: 400_00, pay: 2_000_00 },
  '2026-01': { rent: 1_100_00, food: 350_00, pay: 2_200_00 },
  '2026-02': { rent: 1_100_00, food: 300_00, fun: 900_00, pay: 2_000_00 },
};
const spendData = { spend, spendCategories };

test('insights: what each category added over a year', () => {
  // The brokerage grew 500 from its first balance, paying the loan down added 100, savings lost 100.
  assert.deepEqual(
    categoryChangesBetween(nw, yearSpan(2026, '2026-05-10')!).map((x) => [x.category.id, x.change]),
    [
      ['stocks', 500_00],
      ['loan', 100_00],
      ['cash', -100_00],
    ],
  );
  assert.equal(yearSpan(2027, '2026-05-10'), null);
});

test('insights: debt at the start of the year and now', () => {
  assert.deepEqual(debtBetween(nw, yearSpan(2026, '2026-05-10')!), { start: 500_00, end: 400_00 });
  // The loan was first entered in late 2025: it counts from there.
  assert.deepEqual(debtBetween(nw, yearSpan(2025, '2026-05-10')!), { start: 500_00, end: 500_00 });
  assert.equal(debtBetween({ ...nw, accounts: accounts.slice(0, 2) }, yearSpan(2026, '2026-05-10')!), null);
});

test('insights: a year of spending, from Spending alone', () => {
  const y = spendingYear(spendData, 2026, '2026-05-10')!;
  assert.equal(y.months, 2);
  assert.equal(y.monthly, (1_450_00 + 2_300_00) / 2);
  assert.deepEqual(y.spent.slice(0, 3), [1_450_00, 2_300_00, null]);
  // Investing doesn't change it: what wasn't spent, out of what was earned.
  assert.ok(Math.abs(y.rate! - 450 / 4_200) < 1e-9);
  assert.ok(Math.abs(y.rates[1]! - -300 / 2_000) < 1e-9);
  assert.deepEqual(
    y.categories.map((x) => [x.category.id, x.monthly]),
    [
      ['rent', 1_100_00],
      ['fun', 450_00],
      ['food', 325_00],
    ],
  );
  assert.ok(Math.abs(y.categories[0].share - 2_200 / 3_750) < 1e-9);
  // Mid-February: January counts, the month in progress doesn't.
  assert.equal(spendingYear(spendData, 2026, '2026-02-15')!.monthly, 1_450_00);
  // In January there's nothing finished yet, so what's entered is used.
  assert.equal(spendingYear(spendData, 2026, '2026-01-20')!.months, 2);
  assert.equal(spendingYear(spendData, 2024, '2026-05-10'), null);
  // No income entered: no rate, rather than a bad one.
  const noIncome = { ...spendData, spend: { '2026-01': { rent: 1_000_00 } } };
  assert.equal(spendingYear(noIncome, 2026, '2026-05-10')!.rate, null);
  assert.equal(firstYear({ snapshots, spend }), 2025);
  assert.equal(firstYear({ snapshots: [], spend: {} }), null);
});

test('insights: the last two whole months, across a new year too', () => {
  assert.deepEqual(recentMonths('2026-11-01'), [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ]);
  assert.deepEqual(recentMonths('2026-01-31'), [
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
  ]);
  assert.deepEqual(recentMonths('2026-02-03'), [
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
  ]);
  // From the end of the day before March 1 to the end of April.
  assert.deepEqual(monthsSpan(recentMonths('2026-05-10'), '2026-05-10'), {
    from: dayNumber('2026-02-28'),
    to: dayNumber('2026-04-30'),
  });
  assert.equal(monthsSpan([{ year: 2026, month: 6 }], '2026-05-10'), null);
  assert.equal(monthsLabel(recentMonths('2026-11-01')), 'September and October');
  assert.equal(monthsLabel(recentMonths('2026-02-03')), 'December 2025 and January 2026');
});

test('insights: net worth, categories and debt over the last two months', () => {
  const months = recentMonths('2026-05-10');
  const two = netWorthMonths(nw, months, '2026-05-10')!;
  // March and April: the brokerage counts from its first balance, savings fell 300.
  assert.deepEqual(
    two.months.map((m) => m?.change ?? null),
    [500_00, -300_00],
  );
  assert.equal(two.change, 200_00);
  // The same months as the year view gives.
  const year = netWorthYear(nw, 2026, '2026-05-10')!;
  assert.deepEqual(two.months, year.months.slice(2, 4));
  const span = monthsSpan(months, '2026-05-10')!;
  assert.deepEqual(
    categoryChangesBetween(nw, span).map((x) => [x.category.id, x.change]),
    [
      ['stocks', 500_00],
      ['cash', -300_00],
    ],
  );
  // The loan was paid down in February, before these months.
  assert.deepEqual(debtBetween(nw, span), { start: 400_00, end: 400_00 });
  assert.equal(netWorthMonths(nw, [{ year: 2024, month: 1 }], '2026-05-10'), null);
});

test('insights: spending over a few months counts the ones entered', () => {
  const two = spendingMonths(spendData, [
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
  ])!;
  assert.equal(two.months, 1);
  assert.deepEqual(two.spent, [null, 1_450_00]);
  assert.equal(two.monthly, 1_450_00);
  assert.deepEqual(two.rates[0], null);
  assert.ok(Math.abs(two.rate! - 750 / 2_200) < 1e-9);
  const both = spendingMonths(spendData, [
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
  ])!;
  // January and February are the whole of 2026 so far, so they match the year.
  const year = spendingYear(spendData, 2026, '2026-05-10')!;
  assert.equal(both.monthly, year.monthly);
  assert.equal(both.rate, year.rate);
  assert.deepEqual(both.spent, year.spent.slice(0, 2));
  assert.deepEqual(both.categories.map((x) => x.category.id), ['rent', 'fun', 'food']);
  assert.equal(spendingMonths(spendData, [{ year: 2024, month: 5 }]), null);
});

test('insights: the years Where It Went and Income can show', () => {
  const cats: SpendCategory[] = [
    { id: 'pay', name: 'Pay', group: 'income', order: 0, hidden: false },
    { id: 'rent', name: 'Rent', group: 'recurring', order: 1, hidden: false },
  ];
  const data = {
    spendCategories: cats,
    spend: {
      '2022-03': { rent: 900_00 },
      // Only income entered: a year for Income, not for Where It Went.
      '2023-06': { pay: 3_000_00 },
      '2024-01': { rent: 1_000_00, pay: 3_000_00 },
      // Nothing but zeros: not a year at all.
      '2025-02': { rent: 0 },
      '2026-05': { rent: 1_200_00, pay: 3_500_00 },
      // Still ahead: left out.
      '2027-01': { rent: 1_300_00, pay: 3_600_00 },
      // A category that was deleted: nothing to show for it.
      '2021-04': { gone: 500_00 },
    },
  };
  assert.deepEqual(spendingYears(data, '2026-11-14'), [2026, 2024, 2022]);
  assert.deepEqual(incomeYears(data, '2026-11-14'), [2026, 2024, 2023]);
  // Each of those years has something to draw.
  for (const y of spendingYears(data, '2026-11-14')) assert.ok(spendingYear(data, y, '2026-11-14')!.categories.length > 0);
  // In January with nothing entered yet, last year is the newest.
  assert.deepEqual(spendingYears({ ...data, spend: { '2025-08': { rent: 900_00 } } }, '2026-01-10'), [2025]);
  assert.deepEqual(spendingYears({ spendCategories: cats, spend: {} }, '2026-01-10'), []);

  // The year shown: the one picked while it's on offer, otherwise the newest, otherwise this year.
  assert.equal(shownYear([2026, 2024, 2022], null, 2026), 2026);
  assert.equal(shownYear([2026, 2024, 2022], 2024, 2026), 2024);
  assert.equal(shownYear([2026, 2024, 2022], 2023, 2026), 2026);
  assert.equal(shownYear([2025], null, 2026), 2025);
  assert.equal(shownYear([], 2024, 2026), 2026);
});
