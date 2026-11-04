import { valueAt } from './insights';
import { buildSeries, rangeStart, sliceSeries, type SeriesPoint } from './networth';
import type { Account, Cents, DateKey, NWCategory, RangeKey, Snapshot } from './types';
import { dayNumber } from './dates';

type NWData = { accounts: Account[]; snapshots: Snapshot[]; nwCategories: NWCategory[] };

export interface CategoryLine {
  category: NWCategory;
  /**
   * What the category was worth over the range, debts below zero so the lines
   * add up to net worth at any point. Starts on the chart's first day (at zero
   * when the category had nothing yet) and runs to today.
   */
  points: SeriesPoint[];
  /**
   * At the start of the range (or at the category's first balance, if that
   * was later) and today. Debts are negative.
   */
  start: Cents;
  end: Cents;
}

export interface CategoryLines {
  /** The chart's first and last day. */
  from: number;
  to: number;
  /** The day tracking began, when that's after `from`: changes count from then. */
  since?: number;
  /** Assets biggest first, then debts biggest first. */
  lines: CategoryLine[];
}

/**
 * Every category's value over a range, one line each, for comparing how they
 * did side by side. Debts get their own lines below zero (what you owe pulls
 * net worth down), so nothing is added up without them. Categories with
 * nothing in them over the whole range are left out.
 */
export function categoryLines(data: NWData, range: RangeKey, today: DateKey): CategoryLines | null {
  if (!data.snapshots.length) return null;
  const todayDay = dayNumber(today);
  const raw = data.nwCategories
    .map((category) => {
      const sign = category.kind === 'liability' ? -1 : 1;
      const series = buildSeries(data.snapshots, data.accounts, data.nwCategories, {
        include: (a) => a.categoryId === category.id,
      }).map((p) => ({ ...p, value: p.value * sign }));
      return { category, first: series[0]?.day, series: sliceSeries(series, range, today) };
    })
    .filter((x) => x.series.length > 0);
  if (!raw.length) return null;

  // On All, the chart starts at the first entry of any category.
  const began = Math.min(...raw.map((x) => x.first!));
  const from = rangeStart(range, today) ?? began;
  const lines: CategoryLine[] = [];
  for (const { category, first, series } of raw) {
    // Changes count from the start of the range, or from the end of the day of
    // the category's first balance when that's later: putting money in for the
    // first time isn't growth.
    const base = Math.max(from, Math.floor(first!) + 0.999);
    if (!series.some((p) => p.value !== 0)) continue;
    const points = series[0].day > from ? [{ day: from, value: 0 }, { day: series[0].day, value: 0 }, ...series] : series;
    lines.push({
      category,
      points,
      start: valueAt(points, base) ?? 0,
      end: valueAt(points, todayDay) ?? points[points.length - 1].value,
    });
  }
  lines.sort(
    (a, b) =>
      (a.category.kind === 'liability' ? 1 : 0) - (b.category.kind === 'liability' ? 1 : 0) ||
      Math.abs(b.end) - Math.abs(a.end) ||
      a.category.order - b.category.order,
  );
  return { from, since: began > from ? began : undefined, to: Math.max(todayDay, ...lines.map((l) => l.points[l.points.length - 1].day)), lines };
}

/** A line's value on a day: zero before it starts. */
export function lineValueAt(line: CategoryLine, day: number): Cents {
  return valueAt(line.points, day) ?? 0;
}

/**
 * What a category did for net worth from the start of the range to `day`:
 * an asset growing, or a debt being paid down, counts as adding.
 */
export function lineChange(line: CategoryLine, day?: number): { delta: Cents; ratio: number | null } {
  const end = day == null ? line.end : lineValueAt(line, day);
  const delta = end - line.start;
  return { delta, ratio: line.start !== 0 ? delta / Math.abs(line.start) : null };
}

/** The category that added the most to net worth over the range, if any added anything. */
export function bestLine(lines: CategoryLine[]): CategoryLine | null {
  let best: CategoryLine | null = null;
  for (const l of lines) {
    if (lineChange(l).delta > 0 && (!best || lineChange(l).delta > lineChange(best).delta)) best = l;
  }
  return best;
}
