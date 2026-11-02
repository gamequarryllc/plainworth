import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gridlines, timeAxis } from '../axis';
import { dayNumber } from '../dates';

const texts = (from: string, to: string, width = 393) =>
  timeAxis(dayNumber(from), dayNumber(to), width).map((l) => l.text);

test('chart axis: dates for a month, months for a year, years beyond', () => {
  assert.deepEqual(texts('2026-10-02', '2026-11-01'), ['Oct 8', 'Oct 15', 'Oct 22', 'Oct 29']);
  assert.deepEqual(texts('2026-05-01', '2026-11-01'), ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  assert.deepEqual(texts('2026-01-01', '2026-11-01'), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  // A year doesn't fit every month, so every other one, and January shows the new year.
  assert.deepEqual(texts('2025-11-01', '2026-11-01'), ['Nov', '2026', 'Mar', 'May', 'Jul', 'Sep']);
  assert.deepEqual(texts('2024-11-01', '2026-11-01'), ['2025', 'Apr', 'Jul', 'Oct', '2026', 'Apr', 'Jul']);
  assert.deepEqual(texts('2016-01-01', '2026-11-01'), ['2016', '2018', '2020', '2022', '2024', '2026']);
  assert.deepEqual(texts('2026-11-01', '2026-11-01'), []);
});

test('chart axis: labels stay on screen, apart, and cover their month', () => {
  for (const [from, to] of [
    ['2026-10-02', '2026-11-01'],
    ['2026-05-14', '2026-11-01'],
    ['2025-03-10', '2026-11-01'],
    ['2023-07-19', '2026-11-01'],
  ]) {
    const labels = timeAxis(dayNumber(from), dayNumber(to), 393);
    assert.ok(labels.length >= 3, `${from}: ${labels.length} labels`);
    labels.forEach((l, i) => {
      assert.ok(l.x >= 13 && l.x <= 380, `${from}: ${l.text} at ${l.x}`);
      if (i > 0) assert.ok(l.x - labels[i - 1].x >= 30, `${from}: ${l.text} too close`);
    });
  }
  const [may] = timeAxis(dayNumber('2026-05-01'), dayNumber('2026-11-01'), 393);
  assert.equal(may.from, dayNumber('2026-05-01'));
  assert.equal(may.to, dayNumber('2026-06-01'));
});

test('bar chart gridlines stop just above the tallest bar', () => {
  // In cents: a $6,106 month tops out at $7,500 rather than $10,000.
  assert.deepEqual(gridlines(610_600), [0, 250_000, 500_000, 750_000]);
  assert.deepEqual(gridlines(370_000), [0, 200_000, 400_000]);
  assert.deepEqual(gridlines(100_000), [0, 50_000, 100_000]);
  assert.deepEqual(gridlines(999), [0, 500, 1000]);
  assert.deepEqual(gridlines(0), [0, 1]);
  for (const max of [123, 4_567, 89_012, 345_678, 1_234_567]) {
    const lines = gridlines(max);
    assert.ok(lines[lines.length - 1] >= max && lines.length >= 3 && lines.length <= 5, `${max}: ${lines}`);
  }
});
