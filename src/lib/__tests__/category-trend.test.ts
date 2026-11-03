import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  averageOf,
  categoryChange,
  categoryMonths,
  categoryYears,
  chartableCategories,
  recentCategoryMonths,
} from '../category-trend';
import type { SpendCategory } from '../types';

const spendCategories: SpendCategory[] = [
  { id: 'rent', name: 'Rent', group: 'recurring', order: 0, hidden: false },
  { id: 'eat', name: 'Eating Out', group: 'variable', order: 1, hidden: false },
  { id: 'gym', name: 'Gym', group: 'recurring', order: 2, hidden: true },
  { id: 'pay', name: 'Paycheck', group: 'income', order: 3, hidden: false },
];

// Jan 2025 to Oct 2026: eating out climbs from $150 to $500; nothing entered in Jun 2025; gym stopped after Mar 2025.
const spend: Record<string, Record<string, number>> = {};
for (let i = 0; i < 22; i++) {
  const y = 2025 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  const key = `${y}-${String(m).padStart(2, '0')}`;
  if (key === '2025-06') continue;
  spend[key] = { rent: 1500_00, eat: (150 + i * 16) * 100, pay: 4000_00, ...(i < 3 ? { gym: 40_00 } : {}) };
}
// The month still going isn't counted.
spend['2026-11'] = { eat: 20_00 };
const data = { spend, spendCategories };
const today = '2026-11-03';

test('category trend: months from the first amount, gaps for months with nothing entered', () => {
  const months = categoryMonths(data, 'eat', today);
  assert.equal(months.length, 22);
  assert.deepEqual(months[0], { year: 2025, month: 1, value: 150_00 });
  assert.equal(months[5].value, null);
  assert.deepEqual(months[21], { year: 2026, month: 10, value: 486_00 });
});

test('category trend: a stopped category ends at its last amount', () => {
  const months = categoryMonths(data, 'gym', today);
  assert.equal(months[2].value, 40_00);
  assert.ok(months.slice(3).every((m) => m.value === null));
});

test('category trend: the last 12 months, average over months entered', () => {
  const months = recentCategoryMonths(data, 'eat', today, 12);
  assert.equal(months.length, 12);
  assert.deepEqual([months[0].year, months[0].month], [2025, 11]);
  assert.equal(averageOf(months), Math.round(months.reduce((s, m) => s + m.value!, 0) / 12));
  // Before the first amount, slots are empty.
  assert.equal(recentCategoryMonths(data, 'eat', today, 30)[0].value, null);
});

test('category trend: lately against a year ago, or the first months', () => {
  const change = categoryChange(categoryMonths(data, 'eat', today))!;
  assert.equal(change.since, 'year');
  assert.equal(change.recent, (454_00 + 470_00 + 486_00) / 3);
  assert.equal(change.before, (262_00 + 278_00 + 294_00) / 3);
  const short = categoryMonths(data, 'eat', today).slice(0, 7);
  const early = categoryChange(short)!;
  assert.deepEqual(early.since, { year: 2025, month: 1 });
  assert.equal(categoryChange(short.slice(0, 4)), null);
});

test('category trend: each year against the one before', () => {
  const years = categoryYears(categoryMonths(data, 'rent', today));
  assert.deepEqual(
    years.map((y) => [y.year, y.months, y.monthly, y.change]),
    [
      [2025, 11, 1500_00, null],
      [2026, 10, 1500_00, 0],
    ],
  );
});

test('category trend: spending first by size, then income', () => {
  assert.deepEqual(
    chartableCategories(data, today).map((c) => c.id),
    ['rent', 'eat', 'gym', 'pay'],
  );
});
