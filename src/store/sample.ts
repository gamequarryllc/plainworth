import { addMonths, dayNumber, keyFromDayNumber, monthKey, parseDateKey, todayKey } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Account, Data, Metal, Snapshot } from '@/lib/types';

import { emptyData } from './defaults';

/** Small seeded generator so the sample looks the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Plan {
  name: string;
  categoryId: string;
  start: number;
  everyDays: number;
  step: (value: number, r: () => number, i: number) => number;
  unit?: { label: string; qty: (i: number) => number; price: (i: number, r: () => number) => number };
  metal?: Metal;
  /** Debts: yearly interest rate in percent. */
  apr?: number;
}

/** How far back the made-up history goes. A shorter sample is the latest part of it. */
const HISTORY = 36;

/**
 * Made-up accounts and spending for the last `months` months: 4 looks like
 * someone new to Plainworth, 36 like someone who's used it for years. Both
 * end at the same balances today; the shorter one just starts later.
 */
export function sampleData(months = HISTORY): Data {
  const data = emptyData();
  const r = rng(42);
  const today = todayKey();
  const startDay = dayNumber(addMonths(today, -HISTORY));
  const firstDay = dayNumber(addMonths(today, -Math.min(months, HISTORY)));
  const endDay = dayNumber(today);

  const plans: Plan[] = [
    { name: 'High-Yield Savings', categoryId: 'cash', start: 1_200, everyDays: 30, step: (v) => v + 420 + r() * 200 },
    { name: 'Checking', categoryId: 'cash', start: 2_400, everyDays: 14, step: () => 1_800 + r() * 2_600 },
    { name: 'Brokerage', categoryId: 'investments', start: 4_000, everyDays: 9, step: (v) => v * (1.004 + (r() - 0.45) * 0.05) + 150 },
    { name: '401(k)', categoryId: 'retirement', start: 16_000, everyDays: 14, step: (v) => v * (1.003 + (r() - 0.45) * 0.035) + 410 },
    { name: 'Roth IRA', categoryId: 'retirement', start: 7_000, everyDays: 30, step: (v) => v * (1.004 + (r() - 0.45) * 0.05) + 290 },
    {
      name: 'Silver',
      categoryId: 'metals',
      start: 0,
      everyDays: 21,
      step: (v) => v,
      unit: {
        label: 'oz',
        qty: (i) => (i < 12 ? 120 : 175),
        price: (i, rr) => 20 + i * 0.58 + (rr() - 0.5) * 2.5,
      },
      metal: 'XAG',
    },
    { name: '2021 Tacoma', categoryId: 'vehicles', start: 38_500, everyDays: 60, step: (v) => v * 0.982 },
    { name: 'Tacoma Loan', categoryId: 'auto-loans', start: 35_000, everyDays: 30, step: (v) => Math.max(0, v - 515), apr: 6.49 },
    { name: 'Student Loan', categoryId: 'student-loans', start: 12_200, everyDays: 30, step: (v) => Math.max(0, v - 160), apr: 4.99 },
    { name: 'Visa', categoryId: 'credit-cards', start: 1_100, everyDays: 30, step: () => 450 + r() * 1_900, apr: 24.99 },
  ];

  const accounts: Account[] = [];
  const snapshots: Snapshot[] = [];
  let createdAt = Date.now() - 1e9;

  for (const plan of plans) {
    const account: Account = {
      id: newId(),
      name: plan.name,
      categoryId: plan.categoryId,
      createdAt: createdAt++,
      closed: false,
      unit: plan.unit?.label,
    };
    if (plan.metal) account.metal = plan.metal;
    if (plan.apr != null) account.apr = plan.apr;
    accounts.push(account);
    let value = plan.start;
    let i = 0;
    const series: Snapshot[] = [];
    for (let day = startDay + Math.floor(r() * 5); day <= endDay; day += plan.everyDays + Math.floor(r() * 4) - 1) {
      const snap: Snapshot = {
        id: newId(),
        accountId: account.id,
        date: keyFromDayNumber(day),
        value: 0,
        createdAt: createdAt++,
      };
      if (plan.unit) {
        const qty = plan.unit.qty(i);
        const price = Math.round(plan.unit.price(i, r) * 100);
        snap.quantity = qty;
        snap.unitPrice = price;
        snap.value = Math.round(qty * price);
      } else {
        if (i > 0) value = plan.step(value, r, i);
        snap.value = Math.round(value * 100);
      }
      series.push(snap);
      i++;
    }
    // A shorter sample starts later: each account's first balance is the one
    // it had then, entered within the first few days.
    const before = series.filter((x) => dayNumber(x.date) < firstDay);
    const kept = series.filter((x) => dayNumber(x.date) >= firstDay);
    if (before.length) {
      const opening = before[before.length - 1];
      opening.date = keyFromDayNumber(Math.min(firstDay + (accounts.length % 4), dayNumber(kept[0]?.date ?? today) - 1));
      kept.unshift(opening);
    }
    snapshots.push(...kept);
  }

  data.accounts = accounts;
  data.snapshots = snapshots;

  // Spending: every month that's over, as far back as the sample goes. Pay
  // and prices rise about 3% a year, so earlier years are a little lower.
  const { y, m } = parseDateKey(today);
  for (let back = HISTORY; back >= 1; back--) {
    const index = y * 12 + m - 1 - back;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const prices = 1.03 ** (year - y);
    const pay = 1.035 ** (year - y);
    const amounts = (base: number, spread: number) => Math.round((base + (r() - 0.5) * spread) * prices * 100);
    const travel = month === 7 || month === 12;
    const entry = {
      rent: Math.round((1_250 * prices) / 5) * 500,
      utilities: amounts(140, 60),
      gas: amounts(120, 70),
      subscriptions: 20_00,
      misc: amounts(40, 60),
      'eating-out': amounts(210, 160),
      groceries: amounts(330, 120),
      entertainment: amounts(70, 90),
      exercise: 45_00,
      general: amounts(90, 100),
      shopping: amounts(140, 220),
      gifts: month === 12 ? amounts(420, 150) : amounts(20, 40),
      travel: travel ? amounts(1_150, 500) : 0,
      investing: travel ? 0 : month === 3 ? 1_000_00 : 250_00,
      'paycheck-1': Math.round(1_853_07 * pay),
      'paycheck-2': Math.round(1_853_07 * pay),
      'other-income': month === 3 ? Math.round(2_400_00 * pay) : month % 4 === 0 ? amounts(300, 200) : 0,
    };
    if (back <= months) data.spend[monthKey(year, month)] = entry;
  }
  return data;
}
