import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatRate, monthlyInterest, payFirst, sortDebts } from '../debts';
import type { AccountSummary } from '../networth';
import { DATA_VERSION, defaultSettings, emptyData } from '../../store/defaults';
import { migrate } from '../../store/migrate';

const debt = (name: string, balance: number, apr?: number) =>
  ({
    account: { id: name, name, categoryId: 'debt', createdAt: 0, closed: false, ...(apr != null ? { apr } : null) },
    balance,
    kind: 'liability',
  }) as AccountSummary;

const visa = debt('Visa', 2_400_00, 24.99);
const car = debt('Car', 18_000_00, 6.49);
const school = debt('School', 9_000_00, 4.99);
const store = debt('Store Card', 600_00);
const paidOff = debt('Old Loan', 0, 9.9);
const names = (list: AccountSummary[]) => list.map((d) => d.account.name);

test('avalanche: highest rate first, unknown rates and paid-off debts last', () => {
  const sorted = sortDebts([school, paidOff, store, car, visa], 'avalanche');
  assert.deepEqual(names(sorted), ['Visa', 'Car', 'School', 'Store Card', 'Old Loan']);
  assert.equal(payFirst(sorted, 'avalanche'), visa);
});

test('snowball: smallest balance first', () => {
  const sorted = sortDebts([school, paidOff, store, car, visa], 'snowball');
  assert.deepEqual(names(sorted), ['Store Card', 'Visa', 'School', 'Car', 'Old Loan']);
  assert.equal(payFirst(sorted, 'snowball'), store);
});

test('off: largest balance first, nothing marked', () => {
  const sorted = sortDebts([school, store, car, visa], 'off');
  assert.deepEqual(names(sorted), ['Car', 'School', 'Visa', 'Store Card']);
  assert.equal(payFirst(sorted, 'off'), undefined);
});

test('avalanche without any rates marks nothing', () => {
  const sorted = sortDebts([debt('A', 500_00), debt('B', 900_00)], 'avalanche');
  assert.equal(payFirst(sorted, 'avalanche'), undefined);
  assert.equal(payFirst([], 'snowball'), undefined);
});

test('monthly interest and rate labels', () => {
  // $2,400 at 24.99% a year is about $49.98 a month.
  assert.equal(monthlyInterest(2_400_00, 24.99), 49_98);
  assert.equal(monthlyInterest(2_400_00, undefined), 0);
  assert.equal(monthlyInterest(0, 24.99), 0);
  assert.equal(formatRate(24.99), '24.99%');
  assert.equal(formatRate(6.5), '6.5%');
  assert.equal(formatRate(0), '0%');
});

test('payoff order starts on Avalanche, and old saved "off" moves to it', () => {
  assert.equal(defaultSettings().payoffOrder, 'avalanche');
  const old = { ...emptyData(), version: 4, settings: { ...defaultSettings(), payoffOrder: 'off' as const } };
  assert.equal(migrate(old).settings.payoffOrder, 'avalanche');
  const snow = { ...old, settings: { ...old.settings, payoffOrder: 'snowball' as const } };
  assert.equal(migrate(snow).settings.payoffOrder, 'snowball');
  // Turned off on purpose after the change: stays off.
  const off = { ...old, version: DATA_VERSION };
  assert.equal(migrate(off).settings.payoffOrder, 'off');
});
