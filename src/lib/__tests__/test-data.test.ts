import assert from 'node:assert/strict';
import { test } from 'node:test';

import { growingMix } from '../insights';
import { dayNumber, todayKey } from '../dates';
import { netWorthHistory, netWorthPace } from '../trends';
import { sampleData } from '../../store/sample';
import { DECADE, decadeSampleData } from '../../store/sample-decade';

// What TestFlight's Load Test Data opens: each set has to be enough for the
// cards a new tester can't see yet.
test('test data: every set has a pace, so Where You’re Headed shows', () => {
  const today = todayKey();
  for (const [name, data] of [
    ['3 months', sampleData(3)],
    ['3 years', sampleData(36)],
    ['10 years', decadeSampleData()],
  ] as const) {
    const history = netWorthHistory(data, today);
    assert.ok(netWorthPace(history) != null, `${name} has a pace`);
    const mix = growingMix(data, dayNumber(today));
    assert.ok(mix.invested > 0 && mix.share > 0 && mix.share < 1, `${name} has some invested and some not`);
  }
  assert.equal(DECADE, 120);
});
