import assert from 'node:assert/strict';
import { test } from 'node:test';

import { valueTicks } from '../axis';
import { addMonths, dayNumber, keyFromDayNumber, shiftMonth } from '../dates';
import { formatMoney, formatTyping, parseAmount } from '../money';
import { buildSeries, seriesByAccount, sliceSeries, seriesChange, summarizeAccounts, totalsOf, updatesByAccount } from '../networth';
import { DATA_VERSION, emptyData } from '../../store/defaults';
import { migrate } from '../../store/migrate';
import { categoriesForMonth, categoryTotals, earnedTotals, yearSummary } from '../spending';
import type { Account, NWCategory, Snapshot, SpendCategory } from '../types';

test('dates', () => {
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(addMonths('2026-01-15', -12), '2025-01-15');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(keyFromDayNumber(dayNumber('2026-11-01')), '2026-11-01');
});

test('money parse/format', () => {
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('$45'), 4500);
  assert.equal(parseAmount('120+45.50-10'), 15550);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('.'), null);
  assert.equal(parseAmount('0.1'), 10);
  assert.equal(formatMoney(123456, 'USD'), '$1,234.56');
  assert.equal(formatMoney(-500, 'USD', { signed: true }), '−$5.00');
  assert.equal(formatMoney(500, 'USD', { signed: true }), '+$5.00');
  assert.equal(formatMoney(1_234_567_00, 'USD', { compact: true }), '$1.2M');
  assert.equal(formatTyping('1234567.891'), '1,234,567.89');
  assert.equal(formatTyping('.5'), '0.5');
  assert.equal(formatTyping('007'), '7');
  assert.equal(formatTyping('1,000.'), '1,000.');
});

const cats: NWCategory[] = [
  { id: 'cash', name: 'Cash', kind: 'asset', order: 0 },
  { id: 'loan', name: 'Loans', kind: 'liability', order: 1 },
];
const accounts: Account[] = [
  { id: 'a', name: 'Savings', categoryId: 'cash', createdAt: 0, closed: false },
  { id: 'b', name: 'Car loan', categoryId: 'loan', createdAt: 0, closed: false },
];
const snaps: Snapshot[] = [
  { id: '1', accountId: 'a', date: '2026-01-01', value: 100_00, createdAt: 1 },
  { id: '2', accountId: 'b', date: '2026-01-01', value: 30_00, createdAt: 2 },
  { id: '3', accountId: 'a', date: '2026-02-01', value: 150_00, createdAt: 3 },
  { id: '4', accountId: 'a', date: '2026-02-01', value: 160_00, createdAt: 4 },
  { id: '5', accountId: 'b', date: '2026-03-01', value: 20_00, createdAt: 5 },
];

test('net worth series and totals', () => {
  const series = buildSeries(snaps, accounts, cats, { signed: true });
  assert.deepEqual(
    series.map((p) => p.value),
    // Two entries for Savings on Feb 1 are two updates, even saved a moment apart.
    [70_00, 120_00, 130_00, 140_00],
  );
  const summaries = summarizeAccounts(accounts, snaps, cats);
  assert.equal(summaries.get('a')!.balance, 160_00);
  assert.equal(summaries.get('a')!.lastChange, 10_00);
  assert.deepEqual(totalsOf(summaries.values()), { assets: 160_00, liabilities: 20_00, net: 140_00 });
  const loanOnly = buildSeries(snaps, accounts, cats, { include: (a) => a.categoryId === 'loan' });
  assert.deepEqual(
    loanOnly.map((p) => p.value),
    [30_00, 20_00],
  );
});

test('slicing a series to a range', () => {
  const series = buildSeries(snaps, accounts, cats, { signed: true });
  const oneMonth = sliceSeries(series, '1M', '2026-03-15');
  // value as of Feb 15 (130.00 → 140.00 on Mar 1), extended to today
  assert.deepEqual(
    oneMonth.map((p) => p.value),
    [130_00, 140_00, 140_00],
  );
  assert.equal(oneMonth[0].day, dayNumber('2026-02-15'));
  assert.equal(seriesChange(oneMonth).delta, 10_00);
  const all = sliceSeries(series, 'ALL', '2026-03-01');
  assert.equal(all.length, 4);
  const single = sliceSeries([{ day: dayNumber('2026-03-01'), value: 5 }], '1M', '2026-03-01');
  assert.equal(single.length, 2);
});

const spendCats: SpendCategory[] = [
  { id: 'rent', name: 'Rent', group: 'recurring', order: 0, hidden: false },
  { id: 'food', name: 'Groceries', group: 'variable', order: 0, hidden: false },
  { id: 'old', name: 'Old', group: 'variable', order: 1, hidden: true },
  { id: 'pay', name: 'Paycheck', group: 'income', order: 0, hidden: false },
];

test('spending summaries', () => {
  const data = {
    spendCategories: spendCats,
    spend: {
      '2026-04': { rent: 1000_00, food: 319_91, pay: 3706_14 },
      '2026-05': { rent: 1000_00, old: 50_00, pay: 3706_14 },
    },
  };
  const y = yearSummary(data, 2026);
  assert.equal(y.months[3].expenses, 1319_91);
  assert.equal(y.months[3].net, 2386_23);
  assert.equal(y.monthsWithData, 2);
  assert.equal(y.net, 3706_14 * 2 - 1319_91 - 1050_00);
  const top = categoryTotals(data, 2026, ['recurring', 'variable']);
  assert.equal(top[0].category.id, 'rent');
  assert.deepEqual(
    categoriesForMonth(spendCats, data.spend['2026-05'], 'variable').map((c) => c.id),
    ['food', 'old'],
  );
  assert.deepEqual(
    categoriesForMonth(spendCats, data.spend['2026-04'], 'variable').map((c) => c.id),
    ['food'],
  );
});

test('per-account series', () => {
  const snap = (id: string, accountId: string, date: string, value: number, createdAt: number) => ({
    id,
    accountId,
    date,
    value,
    createdAt,
  });
  const map = seriesByAccount([
    snap('1', 'a', '2026-01-01', 100, 1),
    snap('2', 'b', '2026-01-01', 50, 2),
    snap('3', 'a', '2026-02-01', 120, 3),
    snap('4', 'a', '2026-02-01', 130, 4),
  ]);
  assert.deepEqual(
    map.get('a')!.map((p) => p.value),
    [100, 130],
  );
  assert.equal(map.get('b')!.length, 1);
  assert.equal(map.get('c'), undefined);
});

test('a month without income entered yet does not count against savings', () => {
  const data = emptyData();
  data.spend = {
    '2026-01': { rent: 1_250_00, groceries: 300_00, 'paycheck-1': 2_000_00 },
    '2026-02': { rent: 1_250_00, groceries: 250_00, 'paycheck-1': 2_000_00 },
    // March so far: rent is in, the paycheck isn't.
    '2026-03': { rent: 1_250_00 },
  };
  const y = yearSummary(data, 2026);
  const earned = earnedTotals(y.months);
  assert.deepEqual(earned, { income: 4_000_00, expenses: 3_050_00, net: 950_00 });
  assert.equal(y.savingsRate, 950_00 / 4_000_00);
  // Spending still counts every month.
  assert.equal(y.expenses, 4_300_00);
  assert.equal(earnedTotals(yearSummary(data, 2025).months).income, 0);
  assert.equal(yearSummary(data, 2025).savingsRate, null);
});

test('the old Invested group is dropped and its money counts as saved', () => {
  const old = {
    version: 3,
    spendCategories: [
      { id: 'rent', name: 'Rent', group: 'recurring', order: 0, hidden: false },
      { id: 'brokerage', name: 'Brokerage', group: 'invest', order: 0, hidden: false },
      { id: 'pay', name: 'Pay', group: 'income', order: 0, hidden: false },
    ],
    spend: {
      '2026-01': { rent: 125000, brokerage: 20000, pay: 370600 },
      '2026-02': { brokerage: 5000 },
    },
  };
  const migrated = migrate(old);
  assert.equal(migrated.version, DATA_VERSION);
  assert.deepEqual(migrated.spendCategories.map((c) => c.id), ['rent', 'pay']);
  // A month that only had investing is left empty.
  assert.deepEqual(migrated.spend, { '2026-01': { rent: 125000, pay: 370600 } });
  // Saved is still income minus spending, the same total as before.
  const year = yearSummary(migrated, 2026);
  assert.equal(year.net, 245600);
  assert.equal(year.monthsWithData, 1);
  // New data has no Invested group, and it isn't added back.
  assert.ok(!migrate(null).spendCategories.some((c) => (c.group as string) === 'invest'));
  assert.deepEqual(migrate({ version: 1, spendCategories: old.spendCategories.slice(0, 1) }).spendCategories.map((c) => c.id), ['rent']);
});

test('Retirement accounts move into Investments', () => {
  const cats = [
    { id: 'cash', name: 'Cash', kind: 'asset', order: 0 },
    { id: 'investments', name: 'Investments', kind: 'asset', order: 1 },
    { id: 'retirement', name: 'Retirement', kind: 'asset', order: 2 },
  ];
  const accounts = [
    { id: 'a', name: '401(k)', categoryId: 'retirement', createdAt: 0 },
    { id: 'b', name: 'Checking', categoryId: 'cash', createdAt: 0 },
  ];
  const snapshots = [{ id: 's', accountId: 'a', date: '2026-10-01', value: 5000_00, createdAt: 0 }];
  const migrated = migrate({ version: 2, nwCategories: cats, accounts, snapshots });
  assert.deepEqual(migrated.nwCategories.map((c) => c.id), ['cash', 'investments']);
  assert.deepEqual(migrated.accounts.map((a) => a.categoryId), ['investments', 'cash']);
  assert.equal(migrated.snapshots.length, 1);
  // If Investments was removed, Retirement takes its place.
  const noInvest = migrate({ version: 2, nwCategories: cats.filter((c) => c.id !== 'investments'), accounts });
  assert.deepEqual(noInvest.nwCategories.map((c) => c.name), ['Cash', 'Investments']);
  assert.equal(noInvest.accounts[0].categoryId, 'investments');
  assert.ok(!emptyData().nwCategories.some((c) => c.id === 'retirement'));
});

test('two updates on the same day both show on the chart', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 1, h, m).getTime();
  const sameDay: Snapshot[] = [
    { id: '1', accountId: 'a', date: '2026-10-31', value: 90_00, createdAt: at(9) - 86_400_000 },
    { id: '2', accountId: 'a', date: '2026-11-01', value: 100_00, createdAt: at(9) },
    { id: '3', accountId: 'a', date: '2026-11-01', value: 104_00, createdAt: at(14, 5) },
  ];
  const series = buildSeries(sameDay, accounts, cats, { signed: true });
  assert.deepEqual(
    series.map((p) => p.value),
    [90_00, 100_00, 104_00],
  );
  const day = dayNumber('2026-11-01');
  assert.deepEqual(
    series.map((p) => p.day),
    [day - 1, day, day + 0.5],
  );
  assert.equal(series[0].at, undefined);
  assert.equal(series[2].at, at(14, 5));
  assert.equal(keyFromDayNumber(series[2].day), '2026-11-01');

  // Day one with two updates draws a line from the first to the second, not a flat one.
  const today = sliceSeries(buildSeries(sameDay.slice(1), accounts, cats), '1M', '2026-11-01');
  assert.deepEqual(
    today.map((p) => p.value),
    [100_00, 104_00],
  );
});

test('entries saved together count as one update', () => {
  // Update Balances saves every account within milliseconds: one point, not a step per account.
  const t = new Date(2026, 10, 1, 9).getTime();
  const batch: Snapshot[] = [
    { id: '1', accountId: 'a', date: '2026-11-01', value: 100_00, createdAt: t },
    { id: '2', accountId: 'b', date: '2026-11-01', value: 30_00, createdAt: t + 1 },
    { id: '3', accountId: 'a', date: '2026-11-01', value: 120_00, createdAt: t + 3_600_000 },
  ];
  const series = buildSeries(batch, accounts, cats, { signed: true });
  assert.deepEqual(
    series.map((p) => p.value),
    [70_00, 90_00],
  );
});

test('quick repeat entries for one account each show on the chart', () => {
  // Three balances typed in a row on one account, seconds apart: a line that climbs, not a flat one.
  const t = new Date(2026, 10, 2, 22, 10).getTime();
  const quick: Snapshot[] = [
    { id: '1', accountId: 'a', date: '2026-11-02', value: 45_088_00, createdAt: t },
    { id: '2', accountId: 'a', date: '2026-11-02', value: 46_855_00, createdAt: t + 15_000 },
    { id: '3', accountId: 'a', date: '2026-11-02', value: 55_000_00, createdAt: t + 30_000 },
  ];
  const series = buildSeries(quick, accounts, cats, { include: (x) => x.id === 'a' });
  assert.deepEqual(
    series.map((p) => p.value),
    [45_088_00, 46_855_00, 55_000_00],
  );
  const shown = sliceSeries(series, '6M', '2026-11-02');
  assert.deepEqual(
    shown.map((p) => p.value),
    [45_088_00, 46_855_00, 55_000_00],
  );
  assert.equal(updatesByAccount(quick).get('a')?.length, 3);
});

test('a backdated entry on a busy day has no time of day', () => {
  const later = new Date(2026, 10, 5, 9).getTime();
  const backdated: Snapshot[] = [
    { id: '1', accountId: 'a', date: '2026-11-01', value: 100_00, createdAt: new Date(2026, 10, 1, 9).getTime() },
    { id: '2', accountId: 'a', date: '2026-11-01', value: 104_00, createdAt: later },
  ];
  const series = buildSeries(backdated, accounts, cats);
  assert.equal(series.length, 2);
  assert.notEqual(series[0].at, undefined);
  assert.equal(series[1].at, undefined);
});

test('account sparklines show each update, Insights keeps one point a day', () => {
  const t = new Date(2026, 10, 1, 9).getTime();
  const two: Snapshot[] = [
    { id: '1', accountId: 'a', date: '2026-11-01', value: 100_00, createdAt: t },
    { id: '2', accountId: 'a', date: '2026-11-01', value: 104_00, createdAt: t + 3_600_000 },
  ];
  assert.deepEqual(
    updatesByAccount(two).get('a')!.map((p) => p.value),
    [100_00, 104_00],
  );
  assert.deepEqual(
    seriesByAccount(two).get('a')!.map((p) => p.value),
    [104_00],
  );
});

test('a range longer than the history starts at the first entry', () => {
  const series = [
    { day: dayNumber('2026-11-08'), value: 170_000_00 },
    { day: dayNumber('2026-11-12'), value: 174_000_00 },
  ];
  const sliced = sliceSeries(series, '1M', '2026-11-13');
  assert.equal(sliced[0].day, dayNumber('2026-11-08'));
  assert.equal(sliced[sliced.length - 1].day, dayNumber('2026-11-13'));
});

test('gridlines on round values that cover the line', () => {
  assert.deepEqual(valueTicks(45_088_00, 55_000_00), [45_000_00, 47_500_00, 50_000_00, 52_500_00, 55_000_00]);
  assert.deepEqual(valueTicks(0, 170_579_00), [0, 50_000_00, 100_000_00, 150_000_00, 200_000_00]);
  const flat = valueTicks(5_000_00, 5_000_00);
  assert.ok(flat[0] < 5_000_00 && flat[flat.length - 1] > 5_000_00);
});
