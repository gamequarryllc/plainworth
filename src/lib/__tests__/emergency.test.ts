import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMonths, fundSide, fundStatus, spendingAverage } from '../emergency';
import { emptyData } from '../../store/defaults';
import type { Data } from '../types';

function data(): Data {
  const d = emptyData();
  d.accounts = [{ id: 'hys', name: 'HYS', categoryId: 'cash', createdAt: 0, closed: false }];
  d.snapshots = [
    { id: 's1', accountId: 'hys', date: '2026-06-15', value: 10_000_00, createdAt: 0 },
    { id: 's2', accountId: 'hys', date: '2026-11-02', value: 19_800_00, createdAt: 0 },
  ];
  for (const m of ['06', '07', '08', '09', '10']) d.spend[`2026-${m}`] = { rent: 2_000_00, groceries: 1_960_00, 'paycheck-1': 5_000_00 };
  d.spend['2026-11'] = { rent: 9_999_00 }; // the month still going doesn't count
  return d;
}

test('spending average uses finished months, without income', () => {
  assert.deepEqual(spendingAverage(data(), '2026-11-13'), { amount: 3_960_00, months: 5 });
});

test('months covered from a marked account, with a cap and a typed cost', () => {
  const d = data();
  const s = fundStatus({ accounts: [{ id: 'hys' }], months: 6 }, d, '2026-11-13')!;
  assert.equal(formatMonths(s.covered), '5');
  assert.equal(s.toGo, 6 * 3_960_00 - 19_800_00);
  assert.equal(s.history.filter((v) => v != null).length, 6);
  const capped = fundStatus({ accounts: [{ id: 'hys', cap: 15_000_00 }], months: 3, monthly: 5_000_00 }, d, '2026-11-13')!;
  assert.equal(capped.covered, 3);
  assert.equal(capped.toGo, 0);
});

test('works with only Net Worth (typed cost) or only Spending (typed savings)', () => {
  const nwOnly = data();
  nwOnly.spend = {};
  assert.equal(fundStatus({ accounts: [{ id: 'hys' }], months: 6 }, nwOnly, '2026-11-13'), null);
  assert.equal(fundStatus({ accounts: [{ id: 'hys' }], months: 6, monthly: 3_300_00 }, nwOnly, '2026-11-13')!.covered, 6);
  assert.equal(fundSide({ accounts: [{ id: 'hys' }], months: 6 }, nwOnly), 'networth');

  const spendOnly = data();
  spendOnly.accounts = [];
  spendOnly.snapshots = [];
  const fund = { accounts: [], saved: 7_920_00, months: 3 };
  assert.equal(fundStatus(fund, spendOnly, '2026-11-13')!.covered, 2);
  assert.equal(fundSide(fund, spendOnly), 'spending');
  assert.equal(fundSide(undefined, spendOnly), 'spending');
});

test('formatMonths', () => {
  assert.equal(formatMonths(5.14), '5.1');
  assert.equal(formatMonths(0.04), '0');
  assert.equal(formatMonths(12.7), '12');
});
