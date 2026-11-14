import { addMonths, dateKey, dayNumber, parseDateKey, todayKey } from './dates';
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
  return { saved: [], situation, months: SITUATIONS.find((s) => s.key === situation)!.months };
}

/**
 * An emergency fund as stored, made current. The first TestFlight version
 * could follow Net Worth accounts and kept one typed amount; now it's only
 * Spending's, with every amount typed in kept as a dated list.
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
  if (typeof f.monthly === 'number' && f.monthly > 0) fund.monthly = f.monthly;
  if (f.situation === 'steady' || f.situation === 'stake' || f.situation === 'self') fund.situation = f.situation;
  return fund;
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

/** What was in the fund at the end of a day, or null before the first amount. */
function savedOn(fund: EmergencyFund, day: number): Cents | null {
  let value: Cents | null = null;
  for (const s of fund.saved) {
    if (dayNumber(s.date) > day) break;
    value = s.amount;
  }
  return value;
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
  /** Months covered at the end of each of the last 12 months (this one up to today), null before the first amount. */
  history: (number | null)[];
  /** The calendar month (1–12) of each history slot. */
  historyMonths: number[];
}

/** Where the fund stands, or null without an amount saved or a monthly cost. */
export function fundStatus(
  fund: EmergencyFund,
  data: Pick<Data, 'spend' | 'spendCategories'>,
  today: DateKey,
): FundStatus | null {
  const monthly = monthlyCost(fund, data, today);
  const balance = savedNow(fund);
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
    const b = savedOn(fund, end);
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

/** "5.1": one decimal under 10 months, whole months after. */
export function formatMonths(n: number): string {
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
