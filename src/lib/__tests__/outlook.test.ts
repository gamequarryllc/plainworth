import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  goalStatus,
  goalYear,
  grows,
  growthOf,
  inFutureMoney,
  makePlan,
  monthlyRate,
  monthsToReach,
  monthsToYearEnd,
  neededMonthly,
  project,
} from '../outlook';
import type { Outlook } from '../types';

const o: Outlook = { inflation: 0.03, growth: 0.04 };
/** Everything owned is invested: the whole amount grows, and so does everything added. */
const all = (invested: number) => ({ invested, share: 1 });
const none = { invested: 0, share: 0 };
const near = (a: number, b: number, within = 1) => assert.ok(Math.abs(a - b) <= within, `${a} is not within ${within} of ${b}`);

test('outlook: rates compound to the yearly figure', () => {
  near(Math.pow(1 + monthlyRate(0.04), 12), 1.04, 1e-12);
  assert.equal(monthlyRate(0), 0);
});

test('outlook: what you add comes from your pace, less what your money earned', () => {
  // $120,000, all invested, growing $3,900 a month: about $692 of that is 3% inflation plus 4% growth.
  const plan = makePlan(120_000_00, 3_900_00, o, all(120_000_00))!;
  assert.equal(plan.source, 'pace');
  near(plan.earned, 120_000_00 * (Math.pow(1.03 * 1.04, 1 / 12) - 1));
  near(plan.monthly, 3_900_00 - plan.earned);
  near(plan.monthly / 100, 3210, 1);

  // A quarter invested: that part earned growth and inflation, the rest only kept up with prices.
  const part = makePlan(120_000_00, 3_900_00, o, { invested: 30_000_00, share: 0.25 })!;
  near(part.earned, 30_000_00 * (Math.pow(1.03 * 1.04, 1 / 12) - 1) + 90_000_00 * monthlyRate(0.03));
  assert.ok(part.monthly > plan.monthly);
  // Nothing invested: only inflation comes off the pace.
  near(makePlan(120_000_00, 3_900_00, o, none)!.earned, 120_000_00 * monthlyRate(0.03));

  // A small pace on a lot of money: nothing added, growth only.
  assert.equal(makePlan(1_000_000_00, 3_000_00, o, all(1_000_000_00))!.monthly, 0);
  // Debts don't earn growth.
  assert.equal(makePlan(-20_000_00, 1_000_00, o, none)!.monthly, 1_000_00);
  // Going down: that carries on, with inflation taking a bit more, and no growth.
  const falling = makePlan(100_000_00, -500_00, o, all(100_000_00))!;
  assert.equal(falling.source, 'falling');
  assert.equal(falling.rate, 0);
  near(falling.monthly, -500_00 - 100_000_00 * monthlyRate(0.03));
  // Your own number wins, even without enough history.
  assert.deepEqual(makePlan(50_000_00, null, { ...o, monthly: 2_000_00 }, all(50_000_00)), {
    monthly: 2_000_00,
    rate: monthlyRate(0.04),
    invested: 50_000_00,
    share: 1,
    source: 'yours',
    earned: 0,
  });
  assert.equal(makePlan(50_000_00, null, o, none), null);
});

test('outlook: only Investments grows unless a category is switched on', () => {
  assert.equal(grows({ id: 'investments', kind: 'asset' }), true);
  assert.equal(grows({ id: 'cash', kind: 'asset' }), false);
  assert.equal(grows({ id: 'real-estate', kind: 'asset' }), false);
  assert.equal(grows({ id: 'abc', kind: 'asset', grows: true }), true);
  assert.equal(grows({ id: 'investments', kind: 'asset', grows: false }), false);
  // A debt never grows, whatever it says.
  assert.equal(grows({ id: 'abc', kind: 'liability', grows: true }), false);
});

test('outlook: projection compounds, in today’s money', () => {
  const plan = { monthly: 1_000_00, rate: monthlyRate(0.04), ...all(100_000_00), source: 'yours' as const, earned: 0 };
  const p = project(100_000_00, plan, 240);
  assert.equal(p.length, 241);
  assert.equal(p[0], 100_000_00);
  // 20 years: $100,000 × 1.04^20 plus $1,000 a month compounding.
  const r = monthlyRate(0.04);
  const expected = 100_000_00 * Math.pow(1.04, 20) + 1_000_00 * ((Math.pow(1 + r, 240) - 1) / r);
  near(p[240], expected, 5);
  near(p[240] / 100, 583_000, 500);
  // Nothing invested, nothing grows.
  const fromDebt = project(-5_000_00, { ...plan, ...none }, 5);
  assert.deepEqual(fromDebt.slice(0, 6), [-5_000_00, -4_000_00, -3_000_00, -2_000_00, -1_000_00, 0]);
});

test('outlook: only the invested part grows', () => {
  const r = monthlyRate(0.04);
  // $100,000, all in cash: it holds its value, and so does what's added.
  const cash = { monthly: 1_000_00, rate: r, ...none, source: 'yours' as const, earned: 0 };
  near(project(100_000_00, cash, 240)[240], 100_000_00 + 240 * 1_000_00, 1);
  // A $300,000 home and $100,000 invested, nothing added: only the $100,000 compounds.
  const home = { monthly: 0, rate: r, invested: 100_000_00, share: 0.25, source: 'yours' as const, earned: 0 };
  near(project(400_000_00, home, 120)[120], 300_000_00 + 100_000_00 * Math.pow(1.04, 10), 5);
  // Adding $1,000 a month, a quarter of it invested: that quarter compounds too.
  const adding = project(400_000_00, { ...home, monthly: 1_000_00 }, 120)[120];
  const invested = 100_000_00 * Math.pow(1.04, 10) + 250_00 * ((Math.pow(1 + r, 120) - 1) / r);
  near(adding, 300_000_00 + 120 * 750_00 + invested, 5);
  // Investments grow even when debts put net worth below zero.
  const owing = project(-50_000_00, { ...home, share: 1 }, 12)[12];
  near(owing, -50_000_00 + 100_000_00 * 0.04, 5);
});

test('outlook: a falling net worth stops at zero', () => {
  const falling = makePlan(10_000_00, -3_000_00, o, none)!;
  const p = project(10_000_00, falling, 12);
  assert.ok(p[1] < 10_000_00);
  assert.equal(p[12], 0);
  assert.ok(p.every((w) => w >= 0));
  // Already owing more than is owned: it can keep going down.
  const under = project(-10_000_00, makePlan(-10_000_00, -3_000_00, o, none)!, 12);
  assert.ok(under[12] < -40_000_00);
});

test('outlook: when you get there, and what it takes', () => {
  const plan = { monthly: 1_000_00, rate: 0, ...none, source: 'yours' as const, earned: 0 };
  assert.equal(monthsToReach(10_000_00, plan, 20_000_00), 10);
  assert.equal(monthsToReach(30_000_00, plan, 20_000_00), 0);
  assert.equal(monthsToReach(10_000_00, { ...plan, monthly: 0 }, 20_000_00), null);

  near(neededMonthly(10_000_00, { rate: 0, ...none }, 20_000_00, 10), 1_000_00);
  // Growth alone gets there.
  assert.equal(neededMonthly(100_000_00, growthOf(o, all(100_000_00)), 110_000_00, 36), 0);
  // The same money in cash doesn't get there by itself.
  near(neededMonthly(100_000_00, growthOf(o, none), 110_000_00, 36), 10_000_00 / 36, 1);
  // With growth it takes less than the straight-line amount.
  const g = growthOf(o, all(120_000_00));
  const need = neededMonthly(120_000_00, g, 1_700_000_00, 204);
  assert.ok(need < (1_700_000_00 - 120_000_00) / 204);
  near(project(120_000_00, { ...g, monthly: need, source: 'yours', earned: 0 }, 204)[204], 1_700_000_00, 2);
});

test('outlook: goals by year or by age', () => {
  assert.equal(goalYear({ amount: 1, year: 2040 }, undefined), 2040);
  assert.equal(goalYear({ amount: 1, age: 45 }, 1998), 2043);
  assert.equal(goalYear({ amount: 1, age: 45 }, undefined), null);
  assert.equal(goalYear({ amount: 1 }, 1998), null);
  // November 2026 to the end of 2043.
  assert.equal(monthsToYearEnd(2026, 11, 2043), 205);
  assert.equal(monthsToYearEnd(2026, 11, 2026), 1);
  near(inFutureMoney(1_700_000_00, 0.03, 205), 1_700_000_00 * Math.pow(1.03, 205 / 12), 1);

  const plan = makePlan(120_000_00, 3_900_00, o, all(120_000_00))!;
  const r = growthOf(o, all(120_000_00));
  const s = goalStatus({ amount: 1_700_000_00, age: 45 }, 1998, 120_000_00, plan, r, 2026, 11);
  assert.equal(s.dueYear, 2043);
  assert.equal(s.due, 205);
  near(s.progress, 120 / 1700, 1e-9);
  assert.ok(s.reachIn != null && s.reachIn > 205);
  assert.equal(s.onTrack, false);
  assert.ok(s.needed! > plan.monthly);

  const later = goalStatus({ amount: 1_700_000_00, year: 2060 }, undefined, 120_000_00, plan, r, 2026, 11);
  assert.equal(later.onTrack, true);
  assert.ok(later.needed! < plan.monthly);

  const undated = goalStatus({ amount: 1_700_000_00 }, undefined, 120_000_00, plan, r, 2026, 11);
  assert.equal(undated.due, null);
  assert.equal(undated.onTrack, null);
  assert.equal(undated.needed, null);

  const reached = goalStatus({ amount: 100_000_00, year: 2030 }, undefined, 120_000_00, plan, r, 2026, 11);
  assert.equal(reached.progress, 1);
  assert.equal(reached.reachIn, 0);
  assert.equal(reached.onTrack, true);

  // A date that has passed counts as no date.
  const past = goalStatus({ amount: 1_700_000_00, year: 2025 }, undefined, 120_000_00, plan, r, 2026, 11);
  assert.equal(past.due, null);
});
