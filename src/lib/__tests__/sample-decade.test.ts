import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, todayKey } from '../dates';
import { decadeSampleData } from '../../store/sample-decade';

test('decade sample covers ten years and ends today', () => {
  const data = decadeSampleData();
  const dates = data.snapshots.map((s) => s.date).sort();
  assert.ok(dates[0] <= addMonths(todayKey(), -119));
  assert.equal(dates[dates.length - 1], todayKey());
  assert.ok(Object.keys(data.spend).length === 120);
  // Every open account has a balance today; closed ones end at zero.
  for (const a of data.accounts) {
    const own = data.snapshots.filter((s) => s.accountId === a.id).sort((x, y) => (x.date < y.date ? -1 : 1));
    const last = own[own.length - 1];
    if (a.closed) assert.equal(last.value, 0, a.name);
    else assert.equal(last.date, todayKey(), a.name);
  }
  assert.ok(data.accounts.some((a) => a.closed && a.categoryId === 'student-loans'));
  assert.ok(data.spendCategories.some((c) => c.hidden));
  for (const s of data.snapshots) assert.ok(Number.isInteger(s.value) && s.value >= 0);
});
