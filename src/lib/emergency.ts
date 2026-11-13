import { dayNumber, monthKey, parseDateKey } from './dates';
import { valueAt } from './insights';
import { seriesByAccount } from './networth';
import { spendHistory } from './trends';
import type { Cents, Data, DateKey, EmergencyFund, EmergencySituation } from './types';

/**
 * What a situation suggests keeping: 3 months with a steady paycheck, 6 with
 * more at stake (a home, the only income, a job that's slow to replace), and
 * 9 to 12 when income comes and goes. Self-employed starts at 9; the months
 * can be changed to anything after.
 */
export const SITUATIONS: { key: EmergencySituation; title: string; detail: string; months: number; label: string }[] = [
  { key: 'steady', title: 'Steady Paycheck', detail: 'W-2, no kids, low bills', months: 3, label: '3 mo' },
  { key: 'stake', title: 'More at Stake', detail: 'Homeowner, only income or niche job', months: 6, label: '6 mo' },
  { key: 'self', title: 'Self-Employed', detail: 'Or mostly commission', months: 9, label: '9–12 mo' },
];

export const MONTH_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);

/** How many recent months the spending average looks back over. */
export const AVERAGE_MONTHS = 6;

export function newFund(situation: EmergencySituation = 'stake'): EmergencyFund {
  return { accounts: [], situation, months: SITUATIONS.find((s) => s.key === situation)!.months };
}

/**
 * Average monthly spending (recurring plus spending, no income) over the last
 * six finished months that have spending entered. Null with none.
 */
export function spendingAverage(
  data: Pick<Data, 'spend' | 'spendCategories'>,
  today: DateKey,
): { amount: Cents; months: number } | null {
  const months = spendHistory(data, today)
    .filter((m) => m.totals.expenses > 0)
    .slice(-AVERAGE_MONTHS);
  if (!months.length) return null;
  const total = months.reduce((sum, m) => sum + m.totals.expenses, 0);
  return { amount: Math.round(total / months.length), months: months.length };
}

/** What a month costs: the number typed in, or else the spending average. */
export function monthlyCost(
  fund: EmergencyFund,
  data: Pick<Data, 'spend' | 'spendCategories'>,
  today: DateKey,
): Cents | null {
  if (fund.monthly != null && fund.monthly > 0) return fund.monthly;
  return spendingAverage(data, today)?.amount ?? null;
}

/** The fund's accounts that still exist and are open. */
export function fundAccounts(fund: EmergencyFund, accounts: Data['accounts']) {
  const open = new Set(accounts.filter((a) => !a.closed).map((a) => a.id));
  return fund.accounts.filter((a) => open.has(a.id));
}

/** True when the fund is the marked accounts; false when it's an amount typed in (no accounts). */
export function usesAccounts(fund: EmergencyFund, accounts: Data['accounts']): boolean {
  return fundAccounts(fund, accounts).length > 0;
}

/** The fund's balance on a day: each account's balance then, capped where only part of it counts. */
export function fundBalance(
  fund: EmergencyFund,
  data: Pick<Data, 'accounts' | 'snapshots'>,
  day: number,
  series = seriesByAccount(data.snapshots),
): Cents | null {
  const marked = fundAccounts(fund, data.accounts);
  if (!marked.length) return fund.saved ?? null;
  let total = 0;
  let any = false;
  for (const a of marked) {
    const v = valueAt(series.get(a.id) ?? [], day);
    if (v == null) continue;
    any = true;
    total += Math.max(0, a.cap != null ? Math.min(v, a.cap) : v);
  }
  return any ? total : null;
}

export interface FundStatus {
  balance: Cents;
  monthly: Cents;
  /** Months of costs the fund covers, e.g. 5.1. */
  covered: number;
  goal: number;
  /** What the goal costs in all. */
  target: Cents;
  /** How much more reaches the goal; 0 once there. */
  toGo: Cents;
  /** Months covered at the end of each of the last 12 months (this one up to today), null before the fund had a balance. */
  history: (number | null)[];
  /** The calendar month (1–12) of each history slot. */
  historyMonths: number[];
}

/** Where the fund stands, or null without a balance or a monthly cost. */
export function fundStatus(
  fund: EmergencyFund,
  data: Pick<Data, 'accounts' | 'snapshots' | 'spend' | 'spendCategories'>,
  today: DateKey,
): FundStatus | null {
  const monthly = monthlyCost(fund, data, today);
  const series = seriesByAccount(data.snapshots);
  const balance = fundBalance(fund, data, dayNumber(today), series);
  if (monthly == null || monthly <= 0 || balance == null) return null;
  const goal = fund.months;
  const target = goal * monthly;
  const t = parseDateKey(today);
  const history: (number | null)[] = [];
  const historyMonths: number[] = [];
  const accountsBased = usesAccounts(fund, data.accounts);
  for (let back = 11; back >= 0; back--) {
    const index = t.y * 12 + t.m - 1 - back;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    historyMonths.push(m);
    if (!accountsBased) {
      // A typed amount has no history: only today's point.
      history.push(back === 0 ? balance / monthly : null);
      continue;
    }
    const end = back === 0 ? dayNumber(today) : dayNumber(`${monthKey(y, m)}-01`) + daysIn(y, m) - 1;
    const b = fundBalance(fund, data, end, series);
    history.push(b == null ? null : b / monthly);
  }
  return {
    balance,
    monthly,
    covered: balance / monthly,
    goal,
    target,
    toGo: Math.max(0, target - balance),
    history,
    historyMonths,
  };
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "5.1": one decimal under 10 months, whole months after. */
export function formatMonths(n: number): string {
  if (n >= 10) return String(Math.floor(n));
  return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/** Where the card goes: with the marked accounts on Net Worth, or with a typed amount on Spending. */
export function fundSide(fund: EmergencyFund | undefined, data: Pick<Data, 'accounts' | 'spend'>): 'networth' | 'spending' {
  if (fund) return usesAccounts(fund, data.accounts) ? 'networth' : 'spending';
  return data.accounts.some((a) => !a.closed) || !Object.keys(data.spend).length ? 'networth' : 'spending';
}


