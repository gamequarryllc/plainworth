import type { NetWorthGoal, NWCategory, Outlook } from './types';

/**
 * Looking ahead, in today's money: amounts ahead are what they'd buy now, so a
 * $1.7M goal for 2043 means $1.7M of today's spending power, not whatever $1.7M
 * buys by then.
 *
 * The plan: start from what you have and add the same amount each month
 * (rising with prices). Only what's invested grows, at a steady rate on top of
 * inflation; cash, a home and everything else hold their value. What you add
 * is split the way your money is split today, so the invested part of it grows
 * too. It's worked out from your pace unless you set it: the pace is saving
 * plus growth, so what your money would have earned anyway comes off it.
 */

/** Longest look ahead: 50 years. */
export const MAX_MONTHS = 600;

/** 0.03 → "3%", 0.045 → "4.5%". */
export const ratePercent = (r: number) => `${Math.round(r * 1000) / 10}%`;

/** The monthly rate that compounds to a yearly one. */
export const monthlyRate = (yearly: number) => Math.pow(1 + yearly, 1 / 12) - 1;

/** How much of what you own grows. */
export interface Mix {
  /** What's in the categories that grow (Investments, unless changed), today. */
  invested: number;
  /** That as a share of everything you own, 0 to 1. What you add is split the same way. */
  share: number;
}

/** Nothing invested: no growth. */
export const NO_MIX: Mix = { invested: 0, share: 0 };

/** Does this category grow in the look ahead? Investments does; any other asset category can be switched on. */
export const grows = (c: Pick<NWCategory, 'id' | 'kind' | 'grows'>) =>
  c.kind === 'asset' && (c.grows ?? c.id === 'investments');

export interface Growth extends Mix {
  /** Monthly growth on top of inflation, earned on what's invested. */
  rate: number;
}

export const growthOf = (o: Pick<Outlook, 'growth'>, mix: Mix): Growth => ({ ...mix, rate: monthlyRate(o.growth) });

export interface Plan extends Growth {
  /** Added each month, in today's money. */
  monthly: number;
  /**
   * yours: set in the goal sheet. pace: worked out from your pace.
   * falling: net worth has been going down, so that carries on, no growth assumed.
   */
  source: 'yours' | 'pace' | 'falling';
  /** What your money would have gone up in a month at the assumed rates, taken off the pace. */
  earned: number;
}

/** How the months ahead go, from what you have now, your pace (if there's enough history) and the assumptions. */
export function makePlan(current: number, pace: number | null, o: Outlook, mix: Mix): Plan | null {
  const base = growthOf(o, mix);
  const have = Math.max(current, 0);
  if (o.monthly != null) return { ...base, monthly: o.monthly, source: 'yours', earned: 0 };
  if (pace == null) return null;
  const inflation = monthlyRate(o.inflation);
  if (pace <= 0) {
    // Going down lately: carry that on, with inflation eating into what's left.
    return { ...base, rate: 0, monthly: pace - have * inflation, source: 'falling', earned: 0 };
  }
  // In dollars of the day, investments went up by growth and inflation, and the rest by inflation alone.
  const earned =
    mix.invested * ((1 + inflation) * (1 + base.rate) - 1) + Math.max(have - mix.invested, 0) * inflation;
  return { ...base, monthly: Math.max(0, pace - earned), source: 'pace', earned };
}

/**
 * Walk the months ahead. Stops early when `seen` says so. Returns where it ended.
 * A falling net worth that starts at zero or above stops at zero: with nothing
 * left there is nothing more to lose.
 */
function walk(
  current: number,
  g: Growth,
  monthly: number,
  months: number,
  floor: number,
  seen?: (w: number, n: number) => boolean,
): number {
  let w = current;
  let invested = Math.max(g.invested, 0);
  for (let n = 1; n <= months; n++) {
    const gain = invested * g.rate;
    invested = Math.max(0, invested + gain + monthly * g.share);
    w = Math.max(floor, w + gain + monthly);
    if (seen?.(w, n)) break;
  }
  return w;
}

const floorOf = (current: number, plan: Plan) => (plan.source === 'falling' && current >= 0 ? 0 : -Infinity);

/** Net worth month by month, in today's money: index 0 is now, the last is `months` from now. */
export function project(current: number, plan: Plan, months: number): number[] {
  const out = [current];
  walk(current, plan, plan.monthly, months, floorOf(current, plan), (w) => {
    out.push(w);
    return false;
  });
  return out;
}

/** Months until the plan reaches `target` (0 if you're there), or null if not within 50 years. */
export function monthsToReach(current: number, plan: Plan, target: number): number | null {
  if (current >= target) return 0;
  let at: number | null = null;
  walk(current, plan, plan.monthly, MAX_MONTHS, floorOf(current, plan), (w, n) => {
    if (w < target) return false;
    at = n;
    return true;
  });
  return at;
}

/** What you'd need to add each month, in today's money, to reach `target` in `months`. Zero if growth alone gets there. */
export function neededMonthly(current: number, growth: Growth, target: number, months: number): number {
  if (months <= 0) return Math.max(0, target - current);
  const end = (monthly: number) => walk(current, growth, monthly, months, -Infinity);
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
  growth: Growth,
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
    needed: due != null && !reached ? neededMonthly(current, growth, target, due) : null,
    onTrack: due == null ? null : reached || (reachIn != null && reachIn <= due),
  };
}
