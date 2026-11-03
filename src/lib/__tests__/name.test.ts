import assert from 'node:assert/strict';
import { test } from 'node:test';

import { netWorthTitle, possessive, titleWidth } from '../name';

test('possessive adds ’s, or just ’ after an s', () => {
  assert.equal(possessive('Alex'), 'Alex’s');
  assert.equal(possessive('James'), 'James’');
  assert.equal(possessive('CHRIS'), 'CHRIS’');
});

test('net worth title', () => {
  assert.equal(netWorthTitle(undefined), 'Net Worth');
  assert.equal(netWorthTitle('   '), 'Net Worth');
  assert.equal(netWorthTitle(' Alex '), 'Alex’s Net Worth');
  assert.equal(netWorthTitle('Jo Ann'), 'Jo Ann’s Net Worth');
  assert.equal(netWorthTitle('Alex Curry'), 'Alex’s Net Worth');
  assert.equal(netWorthTitle('Christopher'), 'Net Worth');
  assert.equal(netWorthTitle('Mary   Beth'), 'Mary’s Net Worth');
  assert.equal(netWorthTitle('Elizabeth'), 'Elizabeth’s Net Worth');
  assert.equal(netWorthTitle('Jennifer Lopez'), 'Jennifer’s Net Worth');
  assert.equal(netWorthTitle('Mom & Dad'), 'Net Worth');
});

test('title width estimate is close to San Francisco bold', () => {
  assert.ok(Math.abs(titleWidth('Net Worth') - 158) < 6);
  assert.ok(Math.abs(titleWidth('Christopher’s Net Worth') - 373) < 12);
});
