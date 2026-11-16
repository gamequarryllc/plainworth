import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accountNames,
  formatMonths,
  fundBalance,
  fundStatus,
  normalizeFund,
  sampleFund,
  savedNow,
  spendingAverage,
  withAccounts,
  withSaved,
} from '../emergency';
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

test('older shapes become a list of accounts, with the first kept for 1.2.0', () => {
  // The first TestFlight version: accounts as objects.
  assert.deepEqual(normalizeFund({ accounts: [{ id: 'hys' }], situation: 'stake', months: 6 }, '2026-11-14'), {
    saved: [],
    accounts: ['hys'],
    account: 'hys',
    situation: 'stake',
    months: 6,
  });
  // 1.2.0: one account.
  assert.deepEqual(normalizeFund({ saved: [], account: 'fid', months: 6 }), {
    saved: [],
    accounts: ['fid'],
    account: 'fid',
    months: 6,
  });
  // 1.2.1: the list wins over the 1.2.0 copy.
  assert.deepEqual(normalizeFund({ saved: [], accounts: ['fid', 'cap', 'fid'], account: 'fid', months: 6 }), {
    saved: [],
    accounts: ['fid', 'cap'],
    account: 'fid',
    months: 6,
  });
  assert.deepEqual(withAccounts({ saved: [], accounts: ['fid'], account: 'fid', months: 6 }, []), { saved: [], months: 6 });
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

test('a linked account gives the balance and the graph; spending still gives the monthly cost', () => {
  const d = data();
  d.accounts.push({ id: 'fid', name: 'Fidelity', categoryId: 'cash', createdAt: 0, closed: false });
  d.snapshots.push(
    { id: 's1', accountId: 'fid', date: '2026-08-10', value: 12_000_00, createdAt: 0 },
    { id: 's2', accountId: 'fid', date: '2026-11-05', value: 15_840_00, createdAt: 0 },
  );
  // Typed amounts stay but don't count while the account is linked.
  const fund: EmergencyFund = { saved: [{ date: '2026-06-01', amount: 1_00 }], accounts: ['fid'], months: 6 };
  const s = fundStatus(fund, d, '2026-11-13')!;
  assert.equal(s.balance, 15_840_00);
  assert.equal(s.accounts?.map((a) => a.name).join(), 'Fidelity');
  assert.equal(s.covered, 4);
  assert.equal(s.history.filter((v) => v != null).length, 4); // Aug, Sep, Oct, Nov
  assert.equal(s.history[9], 12_000_00 / 3_960_00);
  // Without spending there's no monthly cost, so no fund.
  const noSpend = emptyData();
  noSpend.accounts = d.accounts;
  noSpend.snapshots = d.snapshots;
  assert.equal(fundStatus(fund, noSpend, '2026-11-13'), null);
  assert.equal(fundBalance(fund, noSpend, '2026-11-13'), 15_840_00);
  // A closed account falls back to the amounts typed in.
  d.accounts[d.accounts.length - 1] = { ...d.accounts[d.accounts.length - 1], closed: true };
  assert.equal(fundStatus(fund, d, '2026-11-13')!.balance, 1_00);
});

test('several accounts add up, each counted from its first balance', () => {
  const d = data();
  d.accounts.push(
    { id: 'fid', name: 'Fidelity Savings', categoryId: 'cash', createdAt: 0, closed: false },
    { id: 'cap', name: 'Capital One Savings', categoryId: 'cash', createdAt: 0, closed: false },
  );
  d.snapshots.push(
    { id: 's1', accountId: 'fid', date: '2026-08-10', value: 10_000_00, createdAt: 0 },
    { id: 's2', accountId: 'cap', date: '2026-10-02', value: 1_880_00, createdAt: 0 },
    { id: 's3', accountId: 'fid', date: '2026-11-05', value: 14_000_00, createdAt: 0 },
  );
  const fund = withAccounts({ saved: [], months: 6 }, ['fid', 'cap', 'gone']);
  const s = fundStatus(fund, d, '2026-11-13')!;
  assert.equal(s.balance, 15_880_00);
  assert.equal(accountNames(s.accounts!), 'Fidelity Savings + Capital One Savings');
  assert.equal(s.history[9], 10_000_00 / 3_960_00); // August: only Fidelity had a balance
  assert.equal(s.history[10], 11_880_00 / 3_960_00); // October: both
  // A closed one drops out of the total.
  d.accounts[d.accounts.length - 1] = { ...d.accounts[d.accounts.length - 1], closed: true };
  assert.equal(fundStatus(fund, d, '2026-11-13')!.balance, 14_000_00);
  assert.equal(accountNames([d.accounts[0], d.accounts[0], d.accounts[0]]), '3 accounts');
});
