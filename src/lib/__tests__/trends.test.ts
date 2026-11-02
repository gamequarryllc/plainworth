import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  distribution,
  lifestyleCreep,
  monthsUntil,
  netWorthHistory,
  netWorthPace,
  netWorthSoFar,
  nextMilestone,
  spentSoFar,
} from '../trends';
import type { Account, NWCategory, Snapshot, SpendCategory } from '../types';

const nwCategories: NWCategory[] = [
  { id: 'cash', name: 'Cash', kind: 'asset', order: 0 },
  { id: 'loan', name: 'Loans', kind: 'liability', order: 1 },
];
const accounts: Account[] = [
  { id: 'a', name: 'Savings', categoryId: 'cash', createdAt: 0, closed: false },
  { id: 'b', name: 'Brokerage', categoryId: 'cash', createdAt: 0, closed: false },
  { id: 'c', name: 'Car loan', categoryId: 'loan', createdAt: 0, closed: false },
];
let n = 0;
const snap = (accountId: string, date: string, value: number): Snapshot => ({ id: String(++n), accountId, date, value, createdAt: n });
const nw = {
  accounts,
  nwCategories,
  snapshots: [
    snap('a', '2025-11-10', 1_000_00),
    snap('c', '2025-11-10', 500_00),
    snap('a', '2025-12-10', 1_200_00),
    snap('a', '2026-01-10', 1_500_00),
    snap('a', '2026-02-10', 1_400_00),
    // A new account isn't growth.
    snap('b', '2026-03-05', 5_000_00),
    snap('a', '2026-03-10', 1_600_00),
    snap('c', '2026-04-10', 300_00),
    snap('a', '2026-05-03', 1_700_00),
  ],
};

test('trends: net worth month by month, from the first balance', () => {
  const h = netWorthHistory(nw, '2026-05-20');
  assert.deepEqual(
    h.map((m) => [m.year, m.month, m.end, m.change, m.finished]),
    [
      [2025, 11, 500_00, 0, true],
      [2025, 12, 700_00, 200_00, true],
      [2026, 1, 1_000_00, 300_00, true],
      [2026, 2, 900_00, -100_00, true],
      [2026, 3, 6_100_00, 200_00, true],
      [2026, 4, 6_300_00, 200_00, true],
      [2026, 5, 6_400_00, 100_00, false],
    ],
  );
  assert.deepEqual(netWorthHistory({ ...nw, snapshots: [] }, '2026-05-20'), []);
});

test('trends: pace, milestones and when you get there', () => {
  const h = netWorthHistory(nw, '2026-05-20');
  // Six finished months: 0 + 200 + 300 − 100 + 200 + 200 = 800.
  assert.deepEqual(netWorthPace(h), { perMonth: 133_33, months: 6 });
  assert.equal(netWorthPace(h.slice(-2)), null);

  assert.equal(nextMilestone(84_320_00), 100_000_00);
  assert.equal(nextMilestone(8_000_00), 10_000_00);
  assert.equal(nextMilestone(320_000_00), 400_000_00);
  assert.equal(nextMilestone(100_000_00), 150_000_00);
  assert.equal(nextMilestone(500_00), 1_000_00);
  assert.equal(nextMilestone(-3_000_00), 0);

  assert.equal(monthsUntil(84_000_00, 100_000_00, 1_000_00), 16);
  assert.equal(monthsUntil(84_000_00, 100_000_00, -1_000_00), null);
});

test('trends: growth so far this year, month by month', () => {
  const h = netWorthHistory(nw, '2026-05-20');
  assert.deepEqual(netWorthSoFar(h, 2026), [300_00, 200_00, 400_00, 600_00, 700_00, null, null, null, null, null, null, null]);
  assert.deepEqual(netWorthSoFar(h, 2025).slice(9), [null, 0, 200_00]);
});


const spendCategories: SpendCategory[] = [
  { id: 'rent', name: 'Rent', group: 'recurring', order: 0, hidden: false },
  { id: 'food', name: 'Groceries', group: 'variable', order: 0, hidden: false },
  { id: 'inv', name: 'Investing', group: 'invest', order: 0, hidden: false },
  { id: 'pay', name: 'Paycheck', group: 'income', order: 0, hidden: false },
];
const spend = {
  '2025-01': { rent: 1_000_00, food: 200_00, pay: 2_000_00 },
  '2025-02': { rent: 1_000_00, food: 400_00, pay: 2_000_00 },
  '2025-03': { rent: 1_000_00, food: 300_00, pay: 2_000_00, inv: 100_00 },
  '2026-01': { rent: 1_100_00, food: 300_00, pay: 2_200_00, inv: 100_00 },
  '2026-02': { rent: 1_100_00, food: 100_00, pay: 2_200_00, inv: 100_00 },
  '2026-03': { rent: 1_100_00, food: 500_00, pay: 2_200_00, inv: 100_00 },
  // Still going: left out.
  '2026-04': { rent: 1_100_00 },
};
const sp = { spend, spendCategories };

test('trends: spending so far this year', () => {
  assert.deepEqual(spentSoFar(sp, 2026, '2026-04-15').slice(0, 5), [1_400_00, 2_600_00, 4_200_00, null, null]);
  assert.deepEqual(spentSoFar(sp, 2025, '2026-04-15').slice(0, 4), [1_200_00, 2_600_00, 3_900_00, null]);
  assert.deepEqual(spentSoFar(sp, 2024, '2026-04-15'), Array(12).fill(null));
});


test('trends: lifestyle creep compares average months', () => {
  const c = lifestyleCreep(sp, '2026-04-15')!;
  assert.equal(c.year, 2026);
  assert.ok(Math.abs(c.income! - 0.1) < 1e-9);
  // 1,300 a month last year, 1,400 this year.
  assert.ok(Math.abs(c.spending - 100 / 1300) < 1e-9);
  assert.equal(c.months.length, 15);
  assert.equal(c.spendingLine[0], 0);
  // April to December 2025 had nothing entered.
  assert.equal(c.spendingLine[5], null);
  // March 2026: the average of January to March, against January 2025.
  assert.ok(Math.abs(c.spendingLine[14]! - 1400 / 1200 + 1) < 1e-9);
  // Too early in the year.
  assert.equal(lifestyleCreep(sp, '2026-02-15'), null);
});


test('trends: what you own by category, period by period', () => {
  const cats = [...nwCategories, { id: 'inv', name: 'Investments', kind: 'asset' as const, order: 2 }];
  const accts = [...accounts.slice(0, 2).map((a) => (a.id === 'b' ? { ...a, categoryId: 'inv' } : a)), accounts[2]];
  const d = distribution({ ...nw, accounts: accts, nwCategories: cats }, '2026-05-20', 'month');
  // Six months back is December; November's first balance is before it.
  assert.deepEqual(d.periods.map((p) => p.month), [12, 1, 2, 3, 4, 5]);
  // Investments are biggest now, so they come first. The loan isn't an asset.
  assert.deepEqual(d.categories.map((c) => c.id), ['inv', 'cash']);
  assert.deepEqual(d.values[0], [0, 1_200_00]);
  assert.deepEqual(d.values[5], [5_000_00, 1_700_00]);

  const q = distribution(nw, '2026-05-20', 'quarter');
  // Q4 2025, Q1 2026, and Q2 so far.
  assert.deepEqual(q.periods.map((p) => [p.year, p.month]), [[2025, 12], [2026, 3], [2026, 6]]);
  assert.deepEqual(distribution({ ...nw, snapshots: [] }, '2026-05-20', 'year').periods, []);
});
