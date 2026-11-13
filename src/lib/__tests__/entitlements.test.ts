import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasPro, LIFETIME_PRODUCT_ID, ownsLifetime } from '../entitlements';

const day = 86_400_000;
const now = Date.UTC(2026, 10, 13);
const lifetime = { productId: LIFETIME_PRODUCT_ID, purchaseDate: now - 10 * day, originalPurchaseDate: now - 10 * day };

test('lifetime Pro unlocks Pro and never runs out', () => {
  assert.equal(hasPro([lifetime], now), true);
  assert.equal(hasPro([lifetime], now + 3650 * day), true);
  assert.equal(ownsLifetime([lifetime]), true);
});

test('nothing bought, or something else bought, is not Pro', () => {
  assert.equal(hasPro([], now), false);
  assert.equal(hasPro([{ ...lifetime, productId: 'something_else' }], now), false);
  assert.equal(ownsLifetime([]), false);
});

test('an expired purchase does not count, a current one does', () => {
  assert.equal(hasPro([{ ...lifetime, expirationDate: now - day }], now), false);
  assert.equal(hasPro([{ ...lifetime, expirationDate: now + day }], now), true);
});
