import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AccountSummary } from '../networth';
import { groupSortable, sortAccounts, sortBy } from '../sort';

const acct = (name: string, balance: number, date?: string, at = 0, lastChange: number | null = null) =>
  ({
    account: { id: name, name, categoryId: 'c', createdAt: 0, closed: false },
    balance,
    kind: 'asset',
    latest: date ? { id: name, accountId: name, date, value: balance, createdAt: at } : undefined,
    lastChange,
  }) as AccountSummary;

const brokerage = acct('Brokerage', 121_852_00, '2026-11-02', 5, 66_852_00);
const roth = acct('Roth IRA', 8_657_00, '2026-11-02', 9, null);
const silver = acct('silver', 6_384_64, '2026-11-03', 1, -16_64);
const fidelity = acct('Fidelity', 5_219_00, '2026-09-01', 0, 500_00);
const fresh = acct('New Card', 0);
const all = [silver, fresh, roth, fidelity, brokerage];
const names = (list: AccountSummary[]) => list.map((s) => s.account.name);

test('highest value is the default', () => {
  assert.deepEqual(names(sortAccounts(all, undefined)), ['Brokerage', 'Roth IRA', 'silver', 'Fidelity', 'New Card']);
  assert.deepEqual(names(sortAccounts(all, 'value')), names(sortAccounts(all, undefined)));
});

test('lowest value', () => {
  assert.deepEqual(names(sortAccounts(all, 'valueAsc')), ['New Card', 'Fidelity', 'silver', 'Roth IRA', 'Brokerage']);
});

test('recently updated: newest day, then latest save; no balance last', () => {
  assert.deepEqual(names(sortAccounts(all, 'updated')), ['silver', 'Roth IRA', 'Brokerage', 'Fidelity', 'New Card']);
});

test('least recently updated: no balance first, then oldest', () => {
  assert.deepEqual(names(sortAccounts(all, 'stale')), ['New Card', 'Fidelity', 'Brokerage', 'Roth IRA', 'silver']);
});

test('biggest change by size, either way; nothing to compare goes last', () => {
  assert.deepEqual(names(sortAccounts(all, 'change')), ['Brokerage', 'Fidelity', 'silver', 'Roth IRA', 'New Card']);
});

test('name ignores case', () => {
  assert.deepEqual(names(sortAccounts(all, 'name')), ['Brokerage', 'Fidelity', 'New Card', 'Roth IRA', 'silver']);
});

test('an unknown sort from a newer backup falls back to highest value', () => {
  assert.deepEqual(names(sortAccounts(all, 'nope' as never)), names(sortAccounts(all, 'value')));
});

test('categories sort by their totals and latest updates', () => {
  const groups = [
    { name: 'Metals', items: [silver] },
    { name: 'Investments', items: [brokerage, roth] },
    { name: 'Cash', items: [fidelity, fresh] },
  ];
  const order = (sort: Parameters<typeof sortBy>[1]) =>
    sortBy(groups, sort, (g) => groupSortable(g.name, g.items)).map((g) => g.name);
  assert.deepEqual(order('value'), ['Investments', 'Metals', 'Cash']);
  assert.deepEqual(order('valueAsc'), ['Cash', 'Metals', 'Investments']);
  assert.deepEqual(order('updated'), ['Metals', 'Investments', 'Cash']);
  assert.deepEqual(order('name'), ['Cash', 'Investments', 'Metals']);
});
