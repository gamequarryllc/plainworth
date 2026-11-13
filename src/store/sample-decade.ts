import { addMonths, dateFromKey, dayNumber, keyFromDayNumber, monthKey, parseDateKey, todayKey } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Account, Data, Metal, Snapshot, SpendCategory, SpendGroup } from '@/lib/types';

import { emptyData } from './defaults';

/** Small seeded generator so the sample looks the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** How far back the decade sample goes, in months. Month 0 is ten years ago, month 120 is today. */
export const DECADE = 120;

/**
 * Ten years of made-up history for someone who has used Plainworth since their
 * first real job: pay rises and two job changes, an old savings account moved
 * to a high-yield one, a house bought in year 5 (rent stops, a mortgage
 * starts), a car traded in and its loan paid off, the student loan and a store
 * card paid off and closed, silver then gold bought over time, a market crash
 * and a bad year, and spending categories that start and stop along the way.
 * Meant for testing long chart ranges, yearly comparisons and goals.
 */
export function decadeSampleData(): Data {
  const data = emptyData();
  const r = rng(2016);
  const today = todayKey();
  const startDay = dayNumber(addMonths(today, -DECADE));
  const endDay = dayNumber(today);
  const dayOf = (m: number) => Math.round(startDay + (m / DECADE) * (endDay - startDay));
  const monthOf = (day: number) => ((day - startDay) / (endDay - startDay)) * DECADE;
  const noise = (spread: number) => 1 + (r() - 0.5) * spread;

  // ---- The market: yearly returns with a crash in year 3 and a bad year 6.
  const yearly = [0.19, -0.05, 0.28, 0.16, 0.26, -0.19, 0.24, 0.22, 0.12, 0.09, 0.08];
  const market: number[] = [1];
  for (let m = 1; m <= DECADE; m++) {
    const year = Math.floor((m - 1) / 12);
    let monthly = (1 + yearly[year]) ** (1 / 12) - 1 + (r() - 0.5) * 0.05;
    if (m === 39) monthly = -0.09;
    if (m === 40) monthly = -0.13;
    if (m === 41) monthly = 0.11;
    if (m === 42) monthly = 0.06;
    market.push(market[m - 1] * (1 + monthly));
  }

  // ---- Pay: yearly raises, a new job in year 3 and year 6, a promotion in year 8.
  const salary = (m: number) => {
    const base = m < 30 ? 52_000 : m < 66 ? 68_000 : m < 96 ? 88_000 : 105_000;
    const since = m < 30 ? m : m < 66 ? m - 30 : m < 96 ? m - 66 : m - 96;
    return base * 1.03 ** Math.floor(since / 12);
  };
  /** One of two take-home paychecks a month. */
  const paycheck = (m: number) => Math.round(((salary(m) * 0.7) / 24) * 100);

  // ---- Monthly balances (in dollars) for each account, built month by month.
  const HOUSE_MONTH = 54;
  const CAR_MONTH = 64;
  const series = (from: number, to: number, start: number, next: (v: number, m: number) => number) => {
    const out: number[] = [];
    let v = start;
    for (let m = from; m <= to; m++) {
      if (m > from) v = next(v, m);
      out[m] = v;
    }
    return out;
  };
  const grow = (m: number) => market[m] / market[m - 1];
  const investedPerMonth = (m: number) => (m < 48 ? 0 : Math.round(300 + (m - 48) * 7.5));

  const k401 = series(0, DECADE, 3_000, (v, m) => v * grow(m) + (salary(m) * 0.12) / 12);
  const roth = series(18, DECADE, 500, (v, m) => v * grow(m) + 500);
  const brokerage = series(48, DECADE, 1_500, (v, m) => v * grow(m) * noise(0.02) + investedPerMonth(m) + (m % 12 === 3 ? 700 : 0));

  const oldSavings = series(0, 28, 2_000, (v) => v + 160);
  const hys = series(28, DECADE, oldSavings[28], (v, m) => {
    if (m === HOUSE_MONTH) return 2_400;
    const rate = m < 72 ? 0.004 : 0.0035;
    const add = m < HOUSE_MONTH ? 520 + (m % 12 === 3 ? 4_000 : 0) : 420 + (m % 12 === 3 ? 1_500 : 0);
    return v * (1 + rate / 12 + 0.0025) + add;
  });

  // Loans: a fixed payment with interest each month, paid off when it reaches 0.
  const loan = (from: number, principal: number, apr: number, payment: (m: number) => number) => {
    const out: number[] = [];
    let v = principal;
    out[from] = v;
    let m = from;
    while (v > 0 && m < DECADE) {
      m++;
      v = Math.max(0, v * (1 + apr / 100 / 12) - payment(m));
      out[m] = v;
    }
    return { values: out, paidOff: v <= 0 ? m : undefined };
  };
  const studentPayment = (m: number) => (m < 66 ? 350 : 800);
  const student = loan(0, 32_000, 5.05, studentPayment);
  const storeCard = loan(0, 2_400, 26.99, () => 220);
  const mortgagePayment = 1_116;
  const mortgage = loan(HOUSE_MONTH, 256_500, 3.25, () => mortgagePayment);
  const carPayment = 620;
  const carLoan = loan(CAR_MONTH, 26_000, 4.9, () => carPayment);

  const home = series(HOUSE_MONTH, DECADE, 285_000, (v, m) => v * (1 + (m < 72 ? 0.07 : 0.035) / 12) * noise(0.004));
  const civic = series(0, CAR_MONTH, 7_500, (v) => v * 0.991);
  const rav4 = series(CAR_MONTH, DECADE, 36_000, (v, m) => v * (m < CAR_MONTH + 12 ? 0.988 : 0.993));
  const visa = series(0, DECADE, 900, (_, m) => (400 + r() * 1_800) * (m < 66 ? 1 : 1.6));
  const checking = series(0, DECADE, 1_800, (_, m) => (salary(m) / 12) * (0.35 + r() * 0.7));

  // Bitcoin: small monthly buys, wild price swings.
  const btcPrice: number[] = [];
  let btcUnits = 0;
  const bitcoin = series(50, DECADE, 0, (_, m) => {
    btcPrice[m] = 9_000 * Math.exp(Math.sin((m - 50) / 9) * 0.7 + (m - 50) / 40) * noise(0.15);
    btcUnits += 100 / btcPrice[m];
    return btcUnits * btcPrice[m];
  });
  bitcoin[50] = 100;

  // Metals: bought a few ounces at a time, priced per ounce.
  const silverPrice = (m: number) => 16.5 + Math.max(0, m - 24) * 0.12 + Math.sin(m / 7) * 2 + (m > 100 ? (m - 100) * 0.55 : 0);
  const silverQty = (m: number) => 20 + 10 * Math.floor((m - 24) / 6);
  const goldPrice = (m: number) => 1_780 + Math.max(0, m - 60) * 16 + Math.sin(m / 6) * 60 + (m > 96 ? (m - 96) * 55 : 0);
  const goldQty = (m: number) => 1 + Math.floor((m - 60) / 15);

  interface Plan {
    name: string;
    categoryId: string;
    open: number;
    /** The month it was closed (sold, moved or paid off). */
    close?: number;
    everyDays: number;
    values: number[];
    apr?: number;
    metal?: { code: Metal; price: (m: number) => number; qty: (m: number) => number };
  }

  const plans: Plan[] = [
    { name: 'Checking', categoryId: 'cash', open: 0, everyDays: 14, values: checking },
    { name: 'Savings', categoryId: 'cash', open: 0, close: 28, everyDays: 30, values: oldSavings },
    { name: 'High-Yield Savings', categoryId: 'cash', open: 28, everyDays: 30, values: hys },
    { name: '401(k)', categoryId: 'investments', open: 0, everyDays: 14, values: k401 },
    { name: 'Roth IRA', categoryId: 'investments', open: 18, everyDays: 30, values: roth },
    { name: 'Brokerage', categoryId: 'investments', open: 48, everyDays: 10, values: brokerage },
    { name: 'Bitcoin', categoryId: 'crypto', open: 50, everyDays: 21, values: bitcoin },
    {
      name: 'Silver',
      categoryId: 'metals',
      open: 24,
      everyDays: 30,
      values: [],
      metal: { code: 'XAG', price: silverPrice, qty: silverQty },
    },
    {
      name: 'Gold',
      categoryId: 'metals',
      open: 60,
      everyDays: 45,
      values: [],
      metal: { code: 'XAU', price: goldPrice, qty: goldQty },
    },
    { name: 'Home', categoryId: 'real-estate', open: HOUSE_MONTH, everyDays: 90, values: home },
    { name: '2011 Civic', categoryId: 'vehicles', open: 0, close: CAR_MONTH, everyDays: 120, values: civic },
    { name: '2022 RAV4', categoryId: 'vehicles', open: CAR_MONTH, everyDays: 90, values: rav4 },
    { name: 'Visa', categoryId: 'credit-cards', open: 0, everyDays: 30, values: visa, apr: 22.99 },
    { name: 'Store Card', categoryId: 'credit-cards', open: 0, close: storeCard.paidOff, everyDays: 30, values: storeCard.values, apr: 26.99 },
    { name: 'Student Loan', categoryId: 'student-loans', open: 0, close: student.paidOff, everyDays: 30, values: student.values, apr: 5.05 },
    { name: 'Mortgage', categoryId: 'mortgages', open: HOUSE_MONTH, close: mortgage.paidOff, everyDays: 30, values: mortgage.values, apr: 3.25 },
    { name: 'RAV4 Loan', categoryId: 'auto-loans', open: CAR_MONTH, close: carLoan.paidOff, everyDays: 30, values: carLoan.values, apr: 4.9 },
  ];

  /** A balance between two months' values, as of a day. */
  const valueAt = (values: number[], m: number) => {
    const lo = Math.floor(m);
    const a = values[lo] ?? values[lo - 1] ?? 0;
    const b = values[lo + 1] ?? a;
    return a + (b - a) * (m - lo);
  };
  /** A realistic save time on that day, between 7 AM and 11 PM. */
  const savedAt = (date: string) => dateFromKey(date).getTime() - 5 * 3_600_000 + Math.floor(r() * 16 * 3_600_000);

  const accounts: Account[] = [];
  const snapshots: Snapshot[] = [];
  for (const plan of plans) {
    const openDay = dayOf(plan.open) + Math.floor(r() * 3);
    const lastDay = plan.close != null ? dayOf(plan.close) : endDay;
    const account: Account = {
      id: newId(),
      name: plan.name,
      categoryId: plan.categoryId,
      createdAt: savedAt(keyFromDayNumber(openDay)),
      closed: plan.close != null,
    };
    if (plan.metal) {
      account.metal = plan.metal.code;
      account.unit = 'oz';
    }
    if (plan.apr != null) account.apr = plan.apr;
    accounts.push(account);

    for (let day = openDay; day <= lastDay; ) {
      const next = day + plan.everyDays + Math.floor(r() * 5) - 2;
      // Open accounts get their last balance today, so every one is up to date.
      const last = plan.close == null && next > endDay;
      const d = last ? endDay : day;
      const date = keyFromDayNumber(d);
      const m = Math.min(DECADE, monthOf(d));
      const snap: Snapshot = { id: newId(), accountId: account.id, date, value: 0, createdAt: savedAt(date) };
      if (plan.metal) {
        const qty = plan.metal.qty(Math.floor(m));
        const price = Math.round(plan.metal.price(m) * noise(0.03) * 100);
        snap.quantity = qty;
        snap.unitPrice = price;
        snap.value = Math.round(qty * price);
      } else {
        snap.value = Math.max(0, Math.round(valueAt(plan.values, m) * 100));
      }
      snapshots.push(snap);
      if (last) break;
      day = next;
    }
    if (plan.close != null) {
      const date = keyFromDayNumber(Math.min(endDay, lastDay + 1));
      snapshots.push({ id: newId(), accountId: account.id, date, value: 0, createdAt: savedAt(date), note: 'Account closed' });
    }
  }
  data.accounts = accounts;
  data.snapshots = snapshots;
  const savings = accounts.find((a) => a.name === 'High-Yield Savings' && !a.closed);
  if (savings) data.settings.emergencyFund = { accounts: [{ id: savings.id }], situation: 'stake', months: 6 };

  // ---- Spending categories that came and went.
  const custom = (name: string, group: SpendGroup, hidden: boolean): SpendCategory => {
    const order = data.spendCategories.filter((c) => c.group === group).length;
    const category = { id: newId(), name, group, order, hidden };
    data.spendCategories.push(category);
    return category;
  };
  const studentCat = custom('Student Loan', 'recurring', student.paidOff != null);
  const mortgageCat = custom('Mortgage', 'recurring', false);
  const carCat = custom('Car Payment', 'recurring', carLoan.paidOff != null);
  const dogCat = custom('Dog', 'variable', false);
  const sideCat = custom('Side Gig', 'income', true);
  // Rent stopped when the house was bought; the gym became running outside.
  for (const c of data.spendCategories) if (c.id === 'rent' || c.id === 'exercise') c.hidden = true;

  // ---- Every month that's over: ten years of spending and income.
  const { y, m: thisMonth } = parseDateKey(today);
  for (let back = DECADE; back >= 1; back--) {
    const m = DECADE - back;
    const index = y * 12 + thisMonth - 1 - back;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    // Prices rise about 3% a year, faster in years 5 to 7.
    const prices = 1.03 ** (m / 12) * (m > 60 ? 1 + Math.min(m - 60, 24) * 0.0025 : 1);
    const cents = (base: number, spread = 0) => Math.max(0, Math.round((base + (r() - 0.5) * spread) * prices * 100));
    const house = m >= HOUSE_MONTH;
    const winter = month === 12 || month <= 2;
    const summer = month >= 6 && month <= 8;
    const travel = month === 7 || month === 12;
    const entry: Record<string, number> = {};
    const put = (id: string, value: number) => {
      if (value > 0) entry[id] = value;
    };

    if (!house) put('rent', Math.round((1_150 * 1.03 ** Math.floor(m / 12)) / 5) * 500);
    else put(mortgageCat.id, Math.round((mortgagePayment + 420 + Math.floor((m - HOUSE_MONTH) / 12) * 15) * 100));
    put('utilities', cents((house ? 230 : 110) * (winter || summer ? 1.3 : 1), 50));
    put('gas', cents(m < CAR_MONTH ? 105 : 125, 60));
    put('subscriptions', Math.round((25 + Math.floor(m / 24) * 8) * 100));
    put('misc', cents(40, 50));
    if (student.paidOff == null || m < student.paidOff) put(studentCat.id, studentPayment(m) * 100);
    if (m >= CAR_MONTH && (carLoan.paidOff == null || m < carLoan.paidOff)) put(carCat.id, carPayment * 100);

    put('eating-out', cents(m < 66 ? 180 : 260, 160));
    put('groceries', cents(house ? 420 : 290, 110));
    put('entertainment', cents(70, 90));
    if (m < 84) put('exercise', Math.round(45 * 100));
    put('general', cents(90, 100) + (m === HOUSE_MONTH ? 3_200_00 : 0));
    put('shopping', cents(140, 220) + (m === HOUSE_MONTH + 1 ? 2_400_00 : 0) + (month === 11 ? cents(250, 100) : 0));
    put('gifts', month === 12 ? cents(m < 66 ? 350 : 600, 150) : cents(20, 40));
    if (travel) put('travel', cents(m < 66 ? 900 : 1_600, 500));
    if (m >= 72) put(dogCat.id, cents(85, 60) + (m === 72 ? 650_00 : 0));

    put('paycheck-1', paycheck(m));
    put('paycheck-2', paycheck(m));
    if (month === 3 && m >= 30) put('other-income', Math.round(salary(m) * 0.06 * 100));
    else if (month === 12) put('other-income', cents(150, 100));
    if (m >= 20 && m < 60 && month % 2 === 0) put(sideCat.id, cents(450, 300));

    data.spend[monthKey(year, month)] = entry;
  }
  return data;
}
