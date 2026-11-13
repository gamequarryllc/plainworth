import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultSpendCategories } from '../../store/defaults';
import { filterSpend, monthTotals } from '../spending';

const data = {
  spendCategories: defaultSpendCategories(),
  spend: { '2026-03': { rent: 150000, 'eating-out': 40000, 'paycheck-1': 400000 } },
};
const totals = (d: typeof data) => monthTotals(d.spend['2026-03'], new Map(d.spendCategories.map((c) => [c.id, c])));

test('all keeps every expense', () => {
  assert.equal(filterSpend(data, 'all'), data);
  assert.equal(totals(data).expenses, 190000);
});

test('recurring counts only Recurring bills, income stays', () => {
  const t = totals(filterSpend(data, 'recurring'));
  assert.equal(t.expenses, 150000);
  assert.equal(t.income, 400000);
});

test('spending leaves out Recurring bills', () => {
  const t = totals(filterSpend(data, 'variable'));
  assert.equal(t.expenses, 40000);
  assert.equal(t.recurring, 0);
});
