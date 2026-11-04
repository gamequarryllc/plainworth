import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  distribution,
  creepMonths,
  lifestyleCreep,
  monthsUntil,
  netWorthHistory,
  netWorthPace,
  compareYears,
  netWorthSoFar,
  nextMilestone,
  spentSoFar,
  yearGoals,
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


test('trends: lifestyle creep finds where spending started to climb', () => {
  const months = creepMonths(sp, '2026-04-15');
  // January 2025 through March 2026, empty months kept.
  assert.equal(months.length, 15);
  assert.deepEqual(months[0], { year: 2025, month: 1, spent: 1_200_00, earned: 2_000_00 });
  assert.equal(months[5].spent, null);
  // Six entered months, spending about the same.
  const flat = lifestyleCreep(months)!;
  assert.equal(flat.direction, 'steady');
  assert.equal(flat.start, null);
  assert.equal(flat.before.spent, 1_300_00);
  assert.equal(flat.lately.spent, 1_400_00);
  assert.equal(flat.lately.earned, 2_200_00);
  // Too few months.
  assert.equal(lifestyleCreep(months.slice(-3)), null);
  assert.deepEqual(creepMonths({ spend: {}, spendCategories }, '2026-04-15'), []);

  // Flat for six months, a raise, then a steady climb: found where the climb starts.
  const at = (spent: number[]) => spent.map((v, i) => ({ year: 2026, month: i + 1, spent: v * 100, earned: (i < 6 ? 3_700 : 5_200) * 100 }));
  const climb = lifestyleCreep(at([1820, 1910, 1780, 1850, 1800, 1870, 2150, 2380, 2560, 2790, 3010, 3240]))!;
  assert.equal(climb.direction, 'up');
  assert.equal(climb.start, 6);
  assert.equal(climb.before.spent, 1_838_33);
  assert.deepEqual(climb.lately.from, { year: 2026, month: 10 });
  assert.equal(climb.lately.spent, 3_013_33);
  assert.equal(climb.before.earned, 3_700_00);

  // A sudden jump is found too.
  const jump = lifestyleCreep(at([1800, 1800, 1800, 1800, 3000, 3000, 3000, 3000]))!;
  assert.equal(jump.start, 4);
  // And a fall.
  assert.equal(lifestyleCreep(at([3000, 3000, 3000, 3000, 1800, 1800, 1800]))!.direction, 'down');
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


test('trends: yearly savings and spending goals', () => {
  // January to March 2026: earned 6,600, spent 4,200, so kept 2,400 (36%).
  const g = yearGoals(sp, { keep: 0.4, limit: 1_300_00 }, 2026, '2026-04-15');
  assert.equal(g.months, 3);
  assert.equal(g.left, 9);
  assert.ok(Math.abs(g.kept! - 2_400 / 6_600) < 1e-9);
  // The rest of the year at 2,200 a month: keep 40% of 26,400 = 10,560, so 8,160 of the 19,800 still to earn.
  assert.ok(Math.abs(g.keepFromHere! - 8_160 / 19_800) < 1e-9);
  assert.equal(g.spent, 1_400_00);
  // 1,300 a month over 12 months is 15,600; 4,200 is spent, leaving 11,400 for 9 months.
  assert.equal(g.spendFromHere, Math.round(11_400_00 / 9));

  // Ahead of a 20% goal, so less is needed from here: 5,280 for the year, 2,400 kept.
  assert.ok(Math.abs(yearGoals(sp, { keep: 0.2 }, 2026, '2026-04-15').keepFromHere! - 2_880 / 19_800) < 1e-9);
  assert.equal(yearGoals(sp, { keep: 0.2 }, 2026, '2026-04-15').spendFromHere, null);
  // A finished year has nothing left to change.
  const last = yearGoals(sp, { keep: 0.4, limit: 1_000_00 }, 2025, '2026-04-15');
  assert.equal(last.left, 0);
  assert.equal(last.keepFromHere, null);
  assert.equal(last.spendFromHere, null);
  // Nothing finished yet this year.
  const early = yearGoals(sp, { keep: 0.2 }, 2026, '2026-01-10');
  assert.equal(early.months, 0);
  assert.equal(early.kept, null);
  assert.equal(early.spent, null);
});

test('trends: this year against last over the same months', () => {
  const n = null;
  // Whole years: compared as they are, at the same point.
  const whole = compareYears([100, 200, 300, n, n, n, n, n, n, n, n, n], [50, 150, 250, 350, 450, 550, n, n, n, n, n, n]);
  assert.equal(whole?.from, 0);
  assert.equal(whole?.last, 2);
  assert.equal(whole?.then, 250);
  // This year starts in March: last year counts from March too.
  const late = compareYears([n, n, 100, 250, n, n, n, n, n, n, n, n], [10, 20, 30, 40, 50, n, n, n, n, n, n, n]);
  assert.equal(late?.from, 2);
  assert.equal(late?.last, 3);
  assert.deepEqual(late?.before.slice(0, 5), [n, n, 10, 20, 30]);
  assert.equal(late?.then, 20);
  // Last year started in October: nothing fair to compare January to November with.
  const started = [n, n, n, n, n, n, n, n, n, 0, 50, 80];
  const partial = compareYears([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, n], started);
  assert.equal(partial?.then, null);
  assert.deepEqual(partial?.before, started);
  // No last year, or nothing this year.
  assert.equal(compareYears([n, 5, n, n, n, n, n, n, n, n, n, n], Array(12).fill(n))?.then, null);
  assert.equal(compareYears(Array(12).fill(n), [1, 2, n, n, n, n, n, n, n, n, n, n]), null);
});
