import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestLine, categoryLines, lineChange, lineValueAt } from '../category-lines';
import { dayNumber } from '../dates';
import type { Account, NWCategory, Snapshot } from '../types';

const nwCategories: NWCategory[] = [
  { id: 'cash', name: 'Cash', kind: 'asset', order: 0 },
  { id: 'inv', name: 'Investments', kind: 'asset', order: 1 },
  { id: 'metal', name: 'Metals', kind: 'asset', order: 2 },
  { id: 'cards', name: 'Credit Cards', kind: 'liability', order: 3 },
  { id: 'empty', name: 'Real Estate', kind: 'asset', order: 4 },
];
const accounts: Account[] = [
  { id: 'chk', name: 'Checking', categoryId: 'cash', createdAt: 0, closed: false },
  { id: 'brk', name: 'Brokerage', categoryId: 'inv', createdAt: 0, closed: false },
  { id: 'gold', name: 'Gold', categoryId: 'metal', createdAt: 0, closed: false },
  { id: 'visa', name: 'Visa', categoryId: 'cards', createdAt: 0, closed: false },
];
let n = 0;
const snap = (accountId: string, date: string, value: number): Snapshot => ({
  id: `s${n}`,
  accountId,
  date,
  value,
  createdAt: n++,
});
const snapshots: Snapshot[] = [
  snap('chk', '2025-01-10', 10_000_00),
  snap('brk', '2025-01-10', 50_000_00),
  snap('visa', '2025-01-10', 4_000_00),
  snap('chk', '2025-11-01', 12_000_00),
  snap('brk', '2025-11-01', 60_000_00),
  snap('visa', '2025-11-01', 3_000_00),
  // Gold bought this spring: before that it sits at zero.
  snap('gold', '2026-04-01', 5_000_00),
  snap('brk', '2026-10-01', 72_000_00),
  snap('visa', '2026-10-01', 1_500_00),
];
const data = { accounts, snapshots, nwCategories };
const today = '2026-11-03';

test('category lines: one per category with something in it, assets first, debts below zero', () => {
  const d = categoryLines(data, '1Y', today)!;
  assert.deepEqual(
    d.lines.map((l) => l.category.id),
    ['inv', 'cash', 'metal', 'cards'],
  );
  assert.equal(d.from, dayNumber('2025-11-03'));
  assert.equal(d.to, dayNumber(today));
  const cards = d.lines[3];
  assert.equal(cards.start, -3_000_00);
  assert.equal(cards.end, -1_500_00);
});

test('category lines: at every point the lines add up to net worth', () => {
  const d = categoryLines(data, 'ALL', today)!;
  const sum = (day: number) => d.lines.reduce((s, l) => s + lineValueAt(l, day), 0);
  assert.equal(sum(dayNumber('2025-02-01')), 10_000_00 + 50_000_00 - 4_000_00);
  assert.equal(sum(dayNumber(today)), 12_000_00 + 72_000_00 + 5_000_00 - 1_500_00);
});

test('category lines: a category that started later sits at zero until then', () => {
  const d = categoryLines(data, '1Y', today)!;
  const metal = d.lines.find((l) => l.category.id === 'metal')!;
  assert.equal(metal.points[0].day, d.from);
  assert.equal(lineValueAt(metal, dayNumber('2026-03-01')), 0);
  assert.equal(lineValueAt(metal, dayNumber('2026-05-01')), 5_000_00);
  // Its change counts from its first balance: buying it isn't growth.
  assert.equal(metal.start, 5_000_00);
  assert.deepEqual(lineChange(metal), { delta: 0, ratio: 0 });
});

test('category lines: a range longer than the history starts at the range start', () => {
  const d = categoryLines(data, '4Y', today)!;
  assert.equal(d.from, dayNumber('2022-11-03'));
  for (const l of d.lines) assert.equal(lineValueAt(l, dayNumber('2024-01-01')), 0);
  // Changes count from the first entry, not from the zeros before it.
  assert.equal(d.since, dayNumber('2025-01-10'));
  assert.deepEqual(lineChange(d.lines[0]), { delta: 22_000_00, ratio: 0.44 });
  assert.equal(categoryLines(data, '1Y', today)!.since, undefined);
});

test('category lines: change counts paying down a debt as adding, and the best is picked', () => {
  const d = categoryLines(data, '1Y', today)!;
  const inv = d.lines[0];
  assert.deepEqual(lineChange(inv), { delta: 12_000_00, ratio: 0.2 });
  const cards = d.lines[3];
  assert.deepEqual(lineChange(cards), { delta: 1_500_00, ratio: 0.5 });
  // Halfway through, before the October update.
  assert.equal(lineChange(inv, dayNumber('2026-06-01')).delta, 0);
  assert.equal(bestLine(d.lines)!.category.id, 'inv');
});

test('category lines: nothing entered means nothing to chart', () => {
  assert.equal(categoryLines({ accounts, snapshots: [], nwCategories }, '1Y', today), null);
});
