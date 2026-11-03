import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maxDrag, orderAt, topOf } from '../drag-order';

const rows = ['utilities', 'gas', 'rent', 'car', 'misc', 'test'];
const even = Object.fromEntries(rows.map((r) => [r, 40]));

test('drag order: holding a row at the bottom puts it last', () => {
  const y = maxDrag(rows, even, 'car');
  assert.deepEqual(orderAt(rows, even, 'car', y), ['utilities', 'gas', 'rent', 'misc', 'test', 'car']);
});

test('drag order: holding a row at the top puts it first', () => {
  const y = -topOf(rows, even, 'car');
  assert.deepEqual(orderAt(rows, even, 'car', y), ['car', 'utilities', 'gas', 'rent', 'misc', 'test']);
});

test('drag order: a taller row can still reach the last slot', () => {
  const heights = { ...even, car: 60 };
  const y = maxDrag(rows, heights, 'car');
  assert.deepEqual(orderAt(rows, heights, 'car', y).at(-1), 'car');
});

test('drag order: small moves keep the order, one row down swaps', () => {
  assert.deepEqual(orderAt(rows, even, 'car', 10), rows);
  assert.deepEqual(orderAt(rows, even, 'car', 41), ['utilities', 'gas', 'rent', 'misc', 'car', 'test']);
  assert.deepEqual(orderAt(rows, even, 'car', -41), ['utilities', 'gas', 'car', 'rent', 'misc', 'test']);
});
