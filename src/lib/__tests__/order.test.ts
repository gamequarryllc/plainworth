import assert from 'node:assert/strict';
import { test } from 'node:test';

import { placeInOrder } from '../order';

const items = [
  { id: 'rent', group: 'recurring', order: 0 },
  { id: 'old', group: 'recurring', order: 1 },
  { id: 'misc', group: 'recurring', order: 2 },
  { id: 'car', group: 'recurring', order: 3 },
  { id: 'food', group: 'variable', order: 0 },
];
const same = (a: (typeof items)[number], b: (typeof items)[number]) => a.group === b.group;
const order = (list: typeof items, group: string) =>
  list
    .filter((i) => i.group === group)
    .sort((a, b) => a.order - b.order)
    .map((i) => i.id);

test('drag order: moves shown categories, hidden ones keep their slot', () => {
  // The month shows rent, misc, car ("old" is hidden); misc is dragged below car.
  const next = placeInOrder(items, ['rent', 'car', 'misc'], same);
  assert.deepEqual(order(next, 'recurring'), ['rent', 'old', 'car', 'misc']);
  assert.deepEqual(order(next, 'variable'), ['food']);
});

test('drag order: ids from another group or unknown ids change nothing', () => {
  assert.equal(placeInOrder(items, ['rent', 'food'], same), items);
  assert.equal(placeInOrder(items, ['nope'], same), items);
});
