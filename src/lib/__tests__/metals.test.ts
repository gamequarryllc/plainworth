import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guessMetal, liveCurrencySupported, parseSpotPrice, spotPriceUrl, spotUpdates } from '../metals';
import type { Account, Snapshot } from '../types';

test('guess a metal from the account name', () => {
  assert.equal(guessMetal('Silver'), 'XAG');
  assert.equal(guessMetal('Silver Eagles'), 'XAG');
  assert.equal(guessMetal('gold coins'), 'XAU');
  assert.equal(guessMetal('Platinum bars'), 'XPT');
  assert.equal(guessMetal('XPD'), 'XPD');
  assert.equal(guessMetal('Goldman Sachs'), undefined);
  assert.equal(guessMetal('Silverado'), undefined);
  assert.equal(guessMetal('Gold and Silver'), undefined);
  assert.equal(guessMetal('Checking'), undefined);
});

test('price source urls and currencies', () => {
  assert.equal(spotPriceUrl('XAG', 'USD'), 'https://api.gold-api.com/price/XAG');
  assert.equal(spotPriceUrl('XAU', 'EUR'), 'https://api.gold-api.com/price/XAU/EUR');
  assert.equal(liveCurrencySupported('USD'), true);
  assert.equal(liveCurrencySupported('JPY'), true);
  assert.equal(liveCurrencySupported('PLN'), false);
});

test('read a price response', () => {
  // Real responses, Oct 31 2026.
  const silver = {
    currency: 'USD',
    currencySymbol: '$',
    exchangeRate: 1.0,
    name: 'Silver',
    price: 49.254002,
    symbol: 'XAG',
    updatedAt: '2026-10-31T13:13:57Z',
    updatedAtReadable: 'a few seconds ago',
  };
  const goldEur = { ...silver, currency: 'EUR', currencySymbol: '€', exchangeRate: 0.8956, name: 'Gold', price: 3471.7037522312, symbol: 'XAU' };
  assert.equal(parseSpotPrice(silver, 'XAG', 'USD'), 4925);
  assert.equal(parseSpotPrice(goldEur, 'XAU', 'EUR'), 347170);
  assert.equal(parseSpotPrice({ price: '31.5' }, 'XAG', 'USD'), 3150);
  // Anything that isn't the quote we asked for is ignored.
  assert.equal(parseSpotPrice(silver, 'XAU', 'USD'), null);
  assert.equal(parseSpotPrice(silver, 'XAG', 'EUR'), null);
  assert.equal(parseSpotPrice({ ...silver, price: 0 }, 'XAG', 'USD'), null);
  assert.equal(parseSpotPrice({ error: 'Unsupported currency' }, 'XAG', 'PLN'), null);
  assert.equal(parseSpotPrice(null, 'XAG', 'USD'), null);
  assert.equal(parseSpotPrice('<html>', 'XAG', 'USD'), null);
});

const account = (id: string, extra: Partial<Account> = {}): Account => ({
  id,
  name: id,
  categoryId: 'metals',
  createdAt: 0,
  closed: false,
  unit: 'oz',
  metal: 'XAG',
  ...extra,
});
let created = 0;
const snap = (accountId: string, date: string, quantity: number | undefined, unitPrice: number, extra: Partial<Snapshot> = {}): Snapshot => ({
  id: `${accountId}-${created}`,
  accountId,
  date,
  value: Math.round((quantity ?? 0) * unitPrice),
  createdAt: created++,
  quantity,
  unitPrice,
  ...extra,
});

test('live prices: what gets written', () => {
  const today = '2026-11-01';
  const accounts = [
    account('older'),
    account('today-auto'),
    account('today-typed'),
    account('closed', { closed: true }),
    account('no-quantity'),
    account('sold-out'),
    account('gold', { metal: 'XAU' }),
    account('plain', { metal: undefined, unit: undefined }),
  ];
  const snapshots = [
    snap('older', '2026-10-29', 175, 4800),
    snap('older', '2026-10-30', 175, 4850),
    snap('today-auto', '2026-10-31', 10, 4900),
    snap('today-auto', today, 10, 4900, { source: 'spot' }),
    snap('today-typed', today, 5, 5000),
    snap('closed', '2026-10-01', 3, 4000),
    snap('no-quantity', '2026-10-01', undefined, 0, { value: 1000 }),
    snap('sold-out', '2026-10-01', 0, 4000),
    snap('gold', '2026-10-30', 2, 380000),
    snap('plain', '2026-10-30', undefined, 0, { value: 500 }),
  ];
  const updates = spotUpdates(accounts, snapshots, { XAG: 4925 }, today);
  assert.deepEqual(updates, [
    { type: 'add', accountId: 'older', date: today, quantity: 175, unitPrice: 4925, value: 861875 },
    { type: 'update', snapshotId: 'today-auto-3', unitPrice: 4925, value: 49250 },
  ]);
  // Gold has no price in this batch; once it does, it gets today's entry too.
  const withGold = spotUpdates(accounts, snapshots, { XAG: 4925, XAU: 387640 }, today);
  assert.equal(withGold.length, 3);
  assert.deepEqual(withGold[2], { type: 'add', accountId: 'gold', date: today, quantity: 2, unitPrice: 387640, value: 775280 });
  // Same price as already saved today: nothing to do.
  assert.deepEqual(spotUpdates([account('today-auto')], snapshots, { XAG: 4900 }, today), []);
});
