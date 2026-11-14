import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMonths, fundStatus, normalizeFund, sampleFund, savedNow, spendingAverage, withSaved } from '../emergency';
import { emptyData } from '../../store/defaults';
import type { Data, EmergencyFund } from '../types';

function data(): Data {
  const d = emptyData();
  for (const m of ['06', '07', '08', '09', '10']) d.spend[`2026-${m}`] = { rent: 2_000_00, groceries: 1_960_00, 'paycheck-1': 5_000_00 };
  d.spend['2026-11'] = { rent: 9_999_00 }; // the month still going doesn't count
  return d;
}

test('spending average uses finished months, without income', () => {
  assert.deepEqual(spendingAverage(data(), '2026-11-13'), { amount: 3_960_00, months: 5 });
});

test('months covered from what was typed in, with a graph point per change', () => {
  const fund: EmergencyFund = {
    saved: [
      { date: '2026-06-15', amount: 10_000_00 },
      { date: '2026-11-02', amount: 19_800_00 },
    ],
    months: 6,
  };
  const s = fundStatus(fund, data(), '2026-11-13')!;
  assert.equal(formatMonths(s.covered), '5');
  assert.equal(s.toGo, 6 * 3_960_00 - 19_800_00);
  assert.equal(s.history.filter((v) => v != null).length, 6);
  assert.equal(s.history[11], 5);
  assert.equal(s.history[10], 10_000_00 / 3_960_00);
  const typed = fundStatus({ ...fund, months: 3, monthly: 6_600_00 }, data(), '2026-11-13')!;
  assert.equal(typed.covered, 3);
  assert.equal(typed.toGo, 0);
});

test('needs an amount and a monthly cost', () => {
  const none = emptyData();
  assert.equal(fundStatus({ saved: [{ date: '2026-11-01', amount: 5_000_00 }], months: 6 }, none, '2026-11-13'), null);
  assert.equal(fundStatus({ saved: [], months: 6 }, data(), '2026-11-13'), null);
});

test('a same-day change replaces the earlier one', () => {
  let f: EmergencyFund = { saved: [], months: 6 };
  f = withSaved(f, 1_000_00, '2026-11-01');
  f = withSaved(f, 2_000_00, '2026-11-13');
  f = withSaved(f, 2_500_00, '2026-11-13');
  assert.deepEqual(f.saved, [
    { date: '2026-11-01', amount: 1_000_00 },
    { date: '2026-11-13', amount: 2_500_00 },
  ]);
  assert.equal(savedNow(f), 2_500_00);
});

test('the first TestFlight shape becomes the Spending-only one', () => {
  assert.deepEqual(normalizeFund({ accounts: [{ id: 'hys' }], situation: 'stake', months: 6 }, '2026-11-14'), {
    saved: [],
    situation: 'stake',
    months: 6,
  });
  assert.deepEqual(normalizeFund({ accounts: [], saved: 9_000_00, months: 3, monthly: 3_000_00 }, '2026-11-14'), {
    saved: [{ date: '2026-11-14', amount: 9_000_00 }],
    months: 3,
    monthly: 3_000_00,
  });
  assert.equal(normalizeFund(undefined), undefined);
});

test('sample fund grows to about 5 months', () => {
  const f = sampleFund('2026-11-14', 12);
  assert.equal(f.saved.length, 13);
  assert.equal(savedNow(f), 19_000_00);
});

test('formatMonths', () => {
  assert.equal(formatMonths(5.14), '5.1');
  assert.equal(formatMonths(0.04), '0');
  assert.equal(formatMonths(12.7), '12');
});
