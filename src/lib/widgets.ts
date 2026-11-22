import { dayNumber, formatDate, MONTHS, parseDateKey } from './dates';
import { growingMix, holdingsOn } from './insights';
import { formatMoney, MASK } from './money';
import { buildSeries, sliceSeries } from './networth';
import { goalStatus, growthOf, makePlan } from './outlook';
import { monthTotals, savingsRate } from './spending';
import { netWorthHistory, netWorthPace, shift, spendHistory } from './trends';
import type { Cents, Data, DateKey } from './types';

/**
 * What the home screen widgets draw. Everything a widget shows is worked out
 * here and handed over as finished text, so the widgets themselves (Swift, in
 * targets/widgets) only lay it out. With Hide Amounts on, the amounts are
 * masked here and percentages take their place.
 */

/** 1 = good (green), -1 = bad (red), 0 = plain. */
export type Tone = 1 | 0 | -1;

export interface WidgetSnapshot {
  v: 1;
  /** Made-up numbers for someone without Pro: the widgets say "Preview · Get Pro". */
  preview: boolean;
  net: {
    /** False until a balance is entered. */
    has: boolean;
    value: string;
    /** "+$2,654 this month", or empty when there's nothing to compare yet. */
    month: string;
    monthTone: Tone;
    /** "+$21,384" */
    span: string;
    /** "Past 6 months", or "Since Oct 3" when the balances don't go back that far. */
    spanLabel: string;
    spanTone: Tone;
    /** The chart's line, oldest first: how far along (0 to 1) and how high (0 to 1). */
    lineX: number[];
    lineY: number[];
  };
  spend: {
    /** False until a month of spending is entered. */
    has: boolean;
    /** "October" */
    month: string;
    spent: string;
    /** "Saved" or "Over by", or empty without income. */
    savedLabel: string;
    /** "$1,333 · 36%" */
    saved: string;
    savedTone: Tone;
    /** Spent as a share of what was earned, 0 to 1, or -1 without income. */
    bar: number;
  };
  goal: {
    /** False until a net worth goal is set. */
    has: boolean;
    /** "$1M by 50" */
    label: string;
    /** "15%" */
    percent: string;
    /** 0 to 1. */
    progress: number;
    /** "On track", "Behind", "Reached", or empty when the goal has no date. */
    status: string;
    statusTone: Tone;
    /** The year the current pace gets there, "2041", or empty when that isn't known. */
    reachYear: string;
    /** "$846,084 to go" */
    toGo: string;
  };
  own: {
    total: string;
    /** Up to four kinds of asset, biggest first; the fourth is "Other" when there are more. */
    rows: { name: string; percent: string; value: string; share: number }[];
    /** Everything owed, "−$23,578", or empty with no debts. */
    debts: string;
  };
}

const toneOf = (n: number): Tone => (n > 0 ? 1 : n < 0 ? -1 : 0);
const percent = (ratio: number, signed = false) => {
  const pct = Math.abs(ratio * 100);
  const body = `${pct >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`;
  return signed ? `${ratio < 0 ? '−' : '+'}${body}` : body;
};

/** At most `max` points, keeping the first and the last. */
function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  return Array.from({ length: max }, (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))]);
}

export function widgetSnapshot(data: Data, today: DateKey, preview = false): WidgetSnapshot {
  const { settings } = data;
  const hidden = settings.hideAmounts;
  const whole = (cents: Cents, signed = false) => formatMoney(cents, settings.currency, { whole: true, signed });
  /** "$1M" from a million up, "$250,000" below. */
  const short = (cents: Cents) =>
    formatMoney(cents, settings.currency, { whole: true, compact: Math.abs(cents) >= 1_000_000_00 });
  const t = parseDateKey(today);
  const todayDay = dayNumber(today);

  // ---- Net worth ----
  const history = netWorthHistory(data, today);
  const now = history[history.length - 1];
  const current = now?.end ?? 0;
  const series = buildSeries(data.snapshots, data.accounts, data.nwCategories, { signed: true });
  const recent = sliceSeries(series, '6M', today);
  // The change over the last six months, month by month, so an account added
  // along the way counts from its first balance and not as a gain.
  const six = history.slice(-6);
  const spanChange = six.reduce((sum, m) => sum + m.change, 0);
  const spanStart = current - spanChange;
  const spanRatio = spanStart !== 0 ? spanChange / Math.abs(spanStart) : 0;
  let earliest = today;
  for (const s of data.snapshots) if (s.date < earliest) earliest = s.date;
  const monthStart = now ? now.end - now.change : 0;
  const monthRatio = monthStart !== 0 && now ? now.change / Math.abs(monthStart) : 0;
  // A first month with one balance has nothing to compare against yet.
  const hasMonth = now != null && (history.length > 1 || now.change !== 0);
  const line = thin(recent, 48);
  const lo = Math.min(...line.map((p) => p.value));
  const hi = Math.max(...line.map((p) => p.value));
  const from = line[0]?.day ?? 0;
  const days = (line[line.length - 1]?.day ?? 0) - from;

  // ---- Spending: the last finished month, or this one when it's all there is ----
  const finished = spendHistory(data, today);
  const categories = new Map(data.spendCategories.map((c) => [c.id, c]));
  const thisMonth = monthTotals(data.spend[`${t.y}-${String(t.m).padStart(2, '0')}`], categories);
  const lastSpend = finished[finished.length - 1];
  const spendMonth = lastSpend ?? (thisMonth.hasData ? { year: t.y, month: t.m, totals: thisMonth } : null);
  const totals = spendMonth?.totals;
  const rate = totals ? savingsRate(totals) : null;
  const over = totals != null && totals.net < 0;

  // ---- Goal ----
  const goal = settings.goal;
  const mix = growingMix(data, todayDay);
  const base = growthOf(settings.outlook, mix);
  const plan = makePlan(current, netWorthPace(history)?.perMonth ?? null, settings.outlook, mix);
  const status = goal && now ? goalStatus(goal, settings.birthYear, current, plan, base, now.year, now.month) : null;
  const reached = goal != null && current >= goal.amount;
  const reachYear =
    status && !reached && status.reachIn != null && now ? String(shift(now, status.reachIn).year) : '';
  const by = goal?.age != null ? ` by ${goal.age}` : goal?.year != null ? ` by ${goal.year}` : '';

  // ---- What you own ----
  const held = holdingsOn(data, todayDay);
  const top = held.assets.length > 4 ? held.assets.slice(0, 3) : held.assets;
  const rest = held.assets.slice(top.length);
  const rows = top.map((h) => ({ name: h.category.name, total: h.total, share: h.share }));
  if (rest.length) {
    rows.push({
      name: 'Other',
      total: rest.reduce((s, h) => s + h.total, 0),
      share: rest.reduce((s, h) => s + h.share, 0),
    });
  }

  return {
    v: 1,
    preview,
    net: {
      has: data.snapshots.length > 0 && now != null,
      value: hidden ? MASK : whole(current),
      month: hasMonth && now ? `${hidden ? percent(monthRatio, true) : whole(now.change, true)} this month` : '',
      monthTone: hasMonth && now ? toneOf(now.change) : 0,
      span: hasMonth ? (hidden ? percent(spanRatio, true) : whole(spanChange, true)) : '',
      spanLabel: history.length >= 6 ? 'Past 6 months' : `Since ${formatDate(earliest, { year: false })}`,
      spanTone: toneOf(spanChange),
      lineX: line.map((p) => (days > 0 ? (p.day - from) / days : 0)),
      lineY: line.map((p) => (hi > lo ? (p.value - lo) / (hi - lo) : 0.5)),
    },
    spend: {
      has: totals != null,
      month: spendMonth ? MONTHS[spendMonth.month - 1] : '',
      spent: totals ? (hidden ? MASK : whole(totals.expenses)) : '',
      savedLabel: rate == null ? '' : over ? 'Over by' : 'Saved',
      saved:
        rate == null || !totals
          ? ''
          : hidden
            ? `${Math.round(Math.abs(rate) * 100)}%`
            : over
              ? whole(-totals.net)
              : `${whole(totals.net)} · ${Math.round(rate * 100)}%`,
      savedTone: rate == null ? 0 : over ? -1 : 1,
      bar: totals && totals.income > 0 ? Math.min(Math.max(totals.expenses / totals.income, 0), 1) : -1,
    },
    goal: {
      has: goal != null && status != null,
      label: goal ? `${hidden ? 'Goal' : short(goal.amount)}${by}` : '',
      percent: status ? `${Math.floor(status.progress * 100)}%` : '',
      progress: status?.progress ?? 0,
      status: reached ? 'Reached' : status?.onTrack == null ? '' : status.onTrack ? 'On track' : 'Behind',
      statusTone: reached || status?.onTrack ? 1 : status?.onTrack === false ? -1 : 0,
      reachYear,
      toGo: goal && !reached && !hidden ? `${whole(goal.amount - current)} to go` : '',
    },
    own: {
      total: hidden ? MASK : whole(current),
      rows: rows.map((r) => ({
        name: r.name,
        percent: percent(r.share),
        value: hidden ? '' : whole(r.total),
        share: r.share,
      })),
      debts: held.debtTotal > 0 && !hidden ? whole(-held.debtTotal) : '',
    },
  };
}
