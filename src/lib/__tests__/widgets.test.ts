import assert from 'node:assert/strict';
import { test } from 'node:test';

import { todayKey } from '../dates';
import { widgetSnapshot } from '../widgets';
import { emptyData } from '../../store/defaults';
import { sampleData } from '../../store/sample';

// What the home screen widgets are handed (the Swift side only lays it out).
test('widgets: a full history fills every widget', () => {
  const data = sampleData(36);
  data.settings.goal = { amount: 1_000_000_00, age: 50 };
  data.settings.birthYear = new Date().getFullYear() - 31;
  const s = widgetSnapshot(data, todayKey());
  assert.equal(s.preview, false);
  assert.ok(s.net.has && s.spend.has && s.goal.has);
  assert.match(s.net.value, /^\$[\d,]+$/);
  assert.match(s.net.month, / this month$/);
  assert.equal(s.net.spanLabel, 'Past 6 months');
  assert.equal(s.net.lineX.length, s.net.lineY.length);
  assert.ok(s.net.lineX.length > 1 && s.net.lineX.length <= 48);
  assert.ok(s.net.lineY.every((y) => y >= 0 && y <= 1));
  assert.equal(s.net.lineX[0], 0);
  assert.equal(s.net.lineX[s.net.lineX.length - 1], 1);
  assert.equal(s.goal.label, '$1M by 50');
  assert.match(s.goal.toGo, / to go$/);
  assert.ok(s.own.rows.length > 0 && s.own.rows.length <= 4);
  assert.ok(Math.abs(s.own.rows.reduce((sum, r) => sum + r.share, 0) - 1) < 1e-9);
});

test('widgets: Hide Amounts leaves no amount anywhere, only percentages', () => {
  const data = sampleData(36);
  data.settings.goal = { amount: 1_000_000_00, year: new Date().getFullYear() + 20 };
  data.settings.hideAmounts = true;
  const s = widgetSnapshot(data, todayKey());
  const { lineX: _x, lineY: _y, ...net } = s.net;
  const text = JSON.stringify({ ...s, net });
  assert.ok(!text.includes('$'), text);
  assert.match(s.net.month, /% this month$/);
  assert.match(s.spend.saved, /^\d+%$/);
});

test('widgets: nothing entered yet says so, and a goal needs setting', () => {
  const s = widgetSnapshot(emptyData(), todayKey());
  assert.equal(s.net.has, false);
  assert.equal(s.spend.has, false);
  assert.equal(s.goal.has, false);
  assert.deepEqual(s.own.rows, []);
  const noGoal = widgetSnapshot(sampleData(3), todayKey());
  assert.ok(noGoal.net.has);
  assert.equal(noGoal.goal.has, false);
});

test('widgets: a preview is marked as one', () => {
  assert.equal(widgetSnapshot(sampleData(), todayKey(), true).preview, true);
});
