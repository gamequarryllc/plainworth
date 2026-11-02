import type { NetWorthGoal, Outlook } from './types';

/**
 * Looking ahead, in today's money: amounts ahead are what they'd buy now, so a
 * $1.7M goal for 2043 means $1.7M of today's spending power, not whatever $1.7M
 * buys by then.
 *
 * The plan is the usual retirement-calculator one: start from what you have,
 * add the same amount each month (rising with prices), and let what you have
 * grow a steady rate on top of inflation. What you add is worked out from your
 * pace unless you set it: the pace is saving plus growth, so the growth your
 * money would have earned anyway comes off it.
 */

/** Longest look ahead: 50 years. */
export const MAX_MONTHS = 600;

/** 0.03 → "3%", 0.045 → "4.5%". */
export const ratePercent = (r: number) => `${Math.round(r * 1000) / 10}%`;

/** The monthly rate that compounds to a yearly one. */
export const monthlyRate = (yearly: number) => Math.pow(1 + yearly, 1 / 12) - 1;

export interface Plan {
  /** Added each month, in today's money. */
  monthly: number;
  /** Monthly growth on top of inflation, earned on what you have while it's above zero. */
  rate: number;
  /**
   * yours: set in the goal sheet. pace: worked out from your pace.
   * falling: net worth has been going down, so that carries on, no growth assumed.
   */
  source: 'yours' | 'pace' | 'falling';
  /** What your money would have earned in a month at the assumed rates, taken off the pace. */
  earned: number;
}

/** How the months ahead go, from what you have now, your pace (if there's enough history) and the assumptions. */
export function makePlan(current: number, pace: number | null, o: Outlook): Plan | null {
  const rate = monthlyRate(o.growth);
  const have = Math.max(current, 0);
  if (o.monthly != null) return { monthly: o.monthly, rate, source: 'yours', earned: 0 };
  if (pace == null) return null;
  if (pace <= 0) {
    // Going down lately: carry that on, with inflation eating into what's left.
    const eaten = have * monthlyRate(o.inflation);
    return { monthly: pace - eaten, rate: 0, source: 'falling', earned: 0 };
  }
  const earned = have * ((1 + monthlyRate(o.inflation)) * (1 + rate) - 1);
  return { monthly: Math.max(0, pace - earned), rate, source: 'pace', earned };
}

const step = (w: number, plan: Pick<Plan, 'monthly' | 'rate'>) => w + Math.max(w, 0) * plan.rate + plan.monthly;

/** Net worth month by month, in today's money: index 0 is now, the last is `months` from now. */
export function project(current: number, plan: Plan, months: number): number[] {
  const out = [current];
  let w = current;
  for (let n = 1; n <= months; n++) {
    w = step(w, plan);
    out.push(w);
  }
  return out;
}

/** Months until the plan reaches `target` (0 if you're there), or null if not within 50 years. */
export function monthsToReach(current: number, plan: Plan, target: number): number | null {
  if (current >= target) return 0;
  let w = current;
  for (let n = 1; n <= MAX_MONTHS; n++) {
    w = step(w, plan);
    if (w >= target) return n;
  }
  return null;
}

/** What you'd need to add each month, in today's money, to reach `target` in `months`. Zero if growth alone gets there. */
export function neededMonthly(current: number, rate: number, target: number, months: number): number {
  if (months <= 0) return Math.max(0, target - current);
  const end = (monthly: number) => {
    let w = current;
    for (let n = 0; n < months; n++) w = step(w, { monthly, rate });
    return w;
  };
  if (end(0) >= target) return 0;
  let lo = 0;
  let hi = Math.max(target - current, 1);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (end(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The year a goal is due: the year itself, or the year you turn the age. */
export function goalYear(goal: NetWorthGoal, birthYear: number | undefined): number | null {
  if (goal.age != null) return birthYear != null ? birthYear + goal.age : null;
  return goal.year ?? null;
}

/** Months from `month` (1–12) of `year` to the end of `dueYear`. */
export function monthsToYearEnd(year: number, month: number, dueYear: number): number {
  return (dueYear - year) * 12 + (12 - month);
}

/** What today's money would be called after `months` of inflation. */
export function inFutureMoney(amount: number, inflation: number, months: number): number {
  return amount * Math.pow(1 + inflation, months / 12);
}

export interface GoalStatus {
  target: number;
  /** How far along, 0 to 1. */
  progress: number;
  /** Months until the plan gets there; 0 if already there, null if not within 50 years. */
  reachIn: number | null;
  /** Months until the end of the goal's year, if it has one; null if none or already past. */
  due: number | null;
  /** The year it's due, if any. */
  dueYear: number | null;
  /** To make the date: what you'd need to add each month, in today's money. */
  needed: number | null;
  /** Reaching it by the date at the current plan. Null without a date. */
  onTrack: boolean | null;
}

/** Where you stand on a goal, as of `year` and `month`. */
export function goalStatus(
  goal: NetWorthGoal,
  birthYear: number | undefined,
  current: number,
  plan: Plan | null,
  rate: number,
  year: number,
  month: number,
): GoalStatus {
  const target = goal.amount;
  const dueYear = goalYear(goal, birthYear);
  const due = dueYear != null && dueYear >= year ? monthsToYearEnd(year, month, dueYear) : null;
  const reachIn = plan ? monthsToReach(current, plan, target) : null;
  const reached = current >= target;
  return {
    target,
    progress: target > 0 ? Math.min(Math.max(current / target, 0), 1) : 1,
    reachIn: reached ? 0 : reachIn,
    due,
    dueYear: due != null ? dueYear : null,
    needed: due != null && !reached ? neededMonthly(current, rate, target, due) : null,
    onTrack: due == null ? null : reached || (reachIn != null && reachIn <= due),
  };
}
