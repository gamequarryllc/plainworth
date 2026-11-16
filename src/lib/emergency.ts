import { addMonths, dateKey, dayNumber, parseDateKey, todayKey } from './dates';
import { valueAt } from './insights';
import { seriesByAccount, type SeriesPoint } from './networth';
import { spendHistory } from './trends';
import type { Account, Cents, Data, DateKey, EmergencyFund, EmergencySituation, ID } from './types';

/** What the fund reads: Spending for a month's cost, and Net Worth only for a linked account's balance. */
export type FundData = Pick<Data, 'spend' | 'spendCategories' | 'accounts' | 'snapshots'>;

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
  return { saved: [], situation, months: SITUATIONS.find((s) => s.key === situation)!.months };
}

/**
 * An emergency fund as stored, made current. The first TestFlight version
 * kept accounts as objects and one typed amount, and 1.2.0 followed only one
 * account; now it's a list of account ids, and every amount typed in is kept
 * as a dated list.
 */
export function normalizeFund(raw: unknown, today: DateKey = todayKey()): EmergencyFund | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const f = raw as Record<string, unknown>;
  let saved: EmergencyFund['saved'] = [];
  if (Array.isArray(f.saved)) {
    saved = f.saved.filter(
      (x): x is { date: DateKey; amount: Cents } =>
        !!x && typeof x.date === 'string' && typeof x.amount === 'number',
    );
  } else if (typeof f.saved === 'number') {
    saved = [{ date: today, amount: f.saved }];
  }
  const months = typeof f.months === 'number' && f.months > 0 ? f.months : 6;
  const fund: EmergencyFund = { saved, months };
  const ids: ID[] = [];
  if (Array.isArray(f.accounts)) {
    for (const x of f.accounts) {
      const id = typeof x === 'string' ? x : x && typeof x.id === 'string' ? (x.id as string) : null;
      if (id && !ids.includes(id)) ids.push(id);
    }
  } else if (typeof f.account === 'string' && f.account) {
    // Saved by 1.2.0, which followed one account.
    ids.push(f.account);
  }
  if (ids.length) {
    fund.accounts = ids;
    fund.account = ids[0];
  }
  if (typeof f.monthly === 'number' && f.monthly > 0) fund.monthly = f.monthly;
  if (f.situation === 'steady' || f.situation === 'stake' || f.situation === 'self') fund.situation = f.situation;
  return fund;
}

/** The open accounts the fund follows; none when it's typed in. Closed or deleted ones drop out. */
export function fundAccounts(fund: EmergencyFund, accounts: Account[]): Account[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return (fund.accounts ?? []).map((id) => byId.get(id)).filter((a): a is Account => !!a && !a.closed);
}

/** The fund following these accounts (none: typed in again), with `account` kept for 1.2.0. */
export function withAccounts(fund: EmergencyFund, ids: ID[]): EmergencyFund {
  const next = { ...fund };
  delete next.accounts;
  delete next.account;
  if (ids.length) {
    next.accounts = ids;
    next.account = ids[0];
  }
  return next;
}

/** "Fidelity + Capital One"; past two, "3 accounts". */
export function accountNames(accounts: Account[]): string {
  return accounts.length > 2 ? `${accounts.length} accounts` : accounts.map((a) => a.name).join(' + ');
}

/** What's in the fund now: the latest amount typed in, or null before any. */
export function savedNow(fund: EmergencyFund): Cents | null {
  return fund.saved.length ? fund.saved[fund.saved.length - 1].amount : null;
}

/** The fund with a new amount in it today. A second change the same day replaces the first. */
export function withSaved(fund: EmergencyFund, amount: Cents, today: DateKey): EmergencyFund {
  const rest = fund.saved.filter((s) => s.date !== today);
  if (rest.length && rest[rest.length - 1].amount === amount) return { ...fund, saved: rest };
  return { ...fund, saved: [...rest, { date: today, amount }].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) };
}

/**
 * Average monthly spending (recurring plus spending, no income) over the last
 * six finished months that have spending entered. Null with none.
 */
export function spendingAverage(
  data: Pick<FundData, 'spend' | 'spendCategories'>,
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
  data: Pick<FundData, 'spend' | 'spendCategories'>,
  today: DateKey,
): Cents | null {
  if (fund.monthly != null && fund.monthly > 0) return fund.monthly;
  return spendingAverage(data, today)?.amount ?? null;
}

/**
 * What was in the fund at the end of a day: the linked accounts' balances
 * then added up (each never below zero; one not opened yet adds nothing), or
 * the last amount typed in by then. Null before either.
 */
function balanceOn(fund: EmergencyFund, day: number, linked: SeriesPoint[][] | null): Cents | null {
  if (linked) {
    let total = 0;
    let any = false;
    for (const series of linked) {
      const v = valueAt(series, day);
      if (v == null) continue;
      any = true;
      total += Math.max(0, v);
    }
    return any ? total : null;
  }
  let value: Cents | null = null;
  for (const s of fund.saved) {
    if (dayNumber(s.date) > day) break;
    value = s.amount;
  }
  return value;
}

/** Each linked account's balances, or null when the fund is typed in. */
function linkedSeries(fund: EmergencyFund, data: Pick<FundData, 'accounts' | 'snapshots'>): SeriesPoint[][] | null {
  const linked = fundAccounts(fund, data.accounts);
  if (!linked.length) return null;
  const ids = new Set(linked.map((a) => a.id));
  const series = seriesByAccount(data.snapshots.filter((s) => ids.has(s.accountId)));
  return linked.map((a) => series.get(a.id) ?? []);
}

/** What's in the fund now, from the linked accounts or the amounts typed in. Null without either. */
export function fundBalance(fund: EmergencyFund, data: Pick<FundData, 'accounts' | 'snapshots'>, today: DateKey): Cents | null {
  return balanceOn(fund, dayNumber(today), linkedSeries(fund, data));
}

export interface FundStatus {
  balance: Cents;
  /** The Net Worth accounts the balance comes from, when they're linked. */
  accounts?: Account[];
  monthly: Cents;
  /** Months of costs the fund covers, e.g. 5.1. */
  covered: number;
  goal: number;
  /** What the goal costs in all. */
  target: Cents;
  /** How much more reaches the goal; 0 once there. */
  toGo: Cents;
  /** Months covered at the end of each of the last 12 months (this one up to today), null before the first amount. */
  history: (number | null)[];
  /** The calendar month (1–12) of each history slot. */
  historyMonths: number[];
}

/** Where the fund stands, or null without an amount saved or a monthly cost. */
export function fundStatus(fund: EmergencyFund, data: FundData, today: DateKey): FundStatus | null {
  const monthly = monthlyCost(fund, data, today);
  const series = linkedSeries(fund, data);
  const balance = balanceOn(fund, dayNumber(today), series);
  if (monthly == null || monthly <= 0 || balance == null) return null;
  const goal = fund.months;
  const target = goal * monthly;
  const t = parseDateKey(today);
  const history: (number | null)[] = [];
  const historyMonths: number[] = [];
  for (let back = 11; back >= 0; back--) {
    const index = t.y * 12 + t.m - 1 - back;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    historyMonths.push(m);
    const end = back === 0 ? dayNumber(today) : dayNumber(dateKey(new Date(y, m, 0)));
    const b = balanceOn(fund, end, series);
    history.push(b == null ? null : b / monthly);
  }
  return {
    balance,
    accounts: series ? fundAccounts(fund, data.accounts) : undefined,
    monthly,
    covered: balance / monthly,
    goal,
    target,
    toGo: Math.max(0, target - balance),
    history,
    historyMonths,
  };
}

/** "5.1": one decimal under 10 months, whole months after. */
export function formatMonths(n: number): string {
  // Tiny costs against real savings: "1,100,000 months" says nothing more than this.
  if (n >= 1000) return '999+';
  if (n >= 10) return String(Math.floor(n));
  return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/** A made-up fund for the sample data: about 5 months of the sample's spending, built up over the last year. */
export function sampleFund(today: DateKey, months = 12): EmergencyFund {
  const count = Math.max(1, Math.min(12, months));
  const saved = Array.from({ length: count + 1 }, (_, i) => {
    const back = count - i;
    return { date: addMonths(today, -back), amount: (19_000 - back * 900) * 100 };
  });
  return { saved, situation: 'stake', months: 6 };
}
