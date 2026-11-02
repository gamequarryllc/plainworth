import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  growthStreaks,
  lifestyleCreep,
  monthsUntil,
  netWorthHistory,
  netWorthPace,
  netWorthSoFar,
  nextMilestone,
  spendHistory,
  spendStreaks,
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

test('trends: growth streaks', () => {
  const s = growthStreaks(netWorthHistory(nw, '2026-05-20'), '2026-05-20');
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
  // January, March, April and May (so far) each set a new high.
  assert.equal(s.highsThisYear, 4);
  assert.deepEqual(
    s.recent.map((m) => m.up),
    [false, true, true, false, true, true],
  );
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

test('trends: spending streaks, broken by a skipped month', () => {
  const history = spendHistory(sp, '2026-04-15');
  assert.equal(history.length, 6);
  const s = spendStreaks(history, '2026-04-15');
  // Kept 36%, 45% and 27% this year; 2025's last month kept 23% but the gap breaks the run.
  assert.equal(s.keeping, 3);
  assert.equal(s.bestKeeping, 3);
  assert.equal(s.investing, 3);
  // The average month is $1,383: March's $1,600 is over it.
  assert.equal(s.underAverage, 0);
  // Nothing entered last month: every streak is over.
  assert.equal(spendStreaks(history, '2026-05-15').keeping, 0);
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

test('trends: the last twelve months for the dots', () => {
  const s = spendStreaks(spendHistory(sp, '2026-04-15'), '2026-04-15');
  assert.equal(s.recent.length, 12);
  assert.deepEqual(s.recent[0], { year: 2025, month: 4, up: false });
  assert.deepEqual(s.recent.slice(-3).map((m) => [m.month, m.up]), [[1, true], [2, true], [3, true]]);
});
