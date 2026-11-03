import { MONTHS_SHORT } from './dates';

export interface AxisLabel {
  text: string;
  /** Center of the label, in points from the left edge of the chart. */
  x: number;
  /** The days this label stands for (day numbers, `to` exclusive), so it can light up while you drag through them. */
  from: number;
  to: number;
}

/** Room each kind of label needs at the 11 pt caption size, gaps included. */
const ROOM = { day: 52, month: 34, year: 46 };
/** How close to an edge a month or year label's center can be before its text would be cut off. */
const EDGE = 13;

const DAY_MS = 86_400_000;
const utc = (n: number) => new Date(n * DAY_MS);
const dayOf = (y: number, m: number, d = 1) => Math.round(Date.UTC(y, m, d) / DAY_MS);

/**
 * Labels along the bottom of a chart that runs from day `first` to day `last`
 * across `width` points: dates for about two months, month names up to four
 * years (January shows the year when the chart spans more than one), years
 * beyond that. Labels that would crowd each other or hang off an edge are left out.
 */
export function timeAxis(first: number, last: number, width: number): AxisLabel[] {
  const span = last - first;
  if (span <= 0 || width <= 0) return [];
  const xOf = (day: number) => ((day - first) / span) * width;
  if (span <= 62) return dayLabels(first, last, width, xOf);
  if (span <= 1461) return spanLabels('month', first, last, width, xOf);
  return spanLabels('year', first, last, width, xOf);
}

/** "Oct 8", "Oct 15", … on fixed days of the month, so they don't shift every day. */
function dayLabels(first: number, last: number, width: number, xOf: (day: number) => number): AxisLabel[] {
  const perDay = width / (last - first);
  const step = [1, 2, 7, 14].find((s) => perDay * s >= ROOM.day) ?? 30;
  const wanted = (d: number) =>
    step === 1 ? true : step === 2 ? d % 2 === 1 : step === 7 ? [1, 8, 15, 22, 29].includes(d) : step === 14 ? d === 1 || d === 15 : d === 1;
  const labels: AxisLabel[] = [];
  for (let day = first; day <= last; day++) {
    const date = utc(day);
    if (!wanted(date.getUTCDate())) continue;
    const x = xOf(day);
    if (x < ROOM.day / 2 - 6 || x > width - ROOM.day / 2 + 6) continue;
    if (labels.length && x - labels[labels.length - 1].x < ROOM.day) continue;
    labels.push({ text: `${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`, x, from: day, to: day });
  }
  return labels;
}

/**
 * One label per month (or year), centered under the part of it the chart shows.
 * When they don't all fit, every 2nd, 3rd or 6th month is kept, counting from
 * January (every 2nd, 5th or 10th year), so the gaps stay even.
 */
function spanLabels(
  unit: 'month' | 'year',
  first: number,
  last: number,
  width: number,
  xOf: (day: number) => number,
): AxisLabel[] {
  const per = (width * (unit === 'month' ? 30.44 : 365.25)) / (last - first);
  const room = ROOM[unit];
  const every = (unit === 'month' ? [1, 2, 3, 6] : [1, 2, 5, 10]).find((k) => per * k >= room) ?? (unit === 'month' ? 12 : 25);
  const start = utc(first);
  const yearsShown = utc(last).getUTCFullYear() !== start.getUTCFullYear();
  let y = start.getUTCFullYear();
  let m = unit === 'month' ? start.getUTCMonth() : 0;
  const labels: AxisLabel[] = [];
  for (;;) {
    const from = dayOf(y, m);
    if (from > last) break;
    const to = unit === 'month' ? dayOf(y, m + 1) : dayOf(y + 1, 0);
    const keep = unit === 'month' ? m % every === 0 : y % every === 0;
    // Only the part of the month on screen counts: a sliver at either end gets no label.
    const shown = xOf(Math.min(to, last)) - xOf(Math.max(from, first));
    const x = (xOf(Math.max(from, first)) + xOf(Math.min(to, last))) / 2;
    if (keep && shown >= Math.min(room - 8, per * 0.7) && x >= EDGE && x <= width - EDGE) {
      const text = unit === 'year' || (m === 0 && yearsShown) ? String(y) : MONTHS_SHORT[m];
      labels.push({ text, x, from, to });
    }
    if (unit === 'month') {
      m += 1;
      if (m === 12) {
        m = 0;
        y += 1;
      }
    } else {
      y += 1;
    }
  }
  return labels;
}

/**
 * Two to four even steps from zero to a round number just above `max`, like
 * $0, $2K, $4K or $0, $2.5K, $5K, $7.5K: whichever leaves the least empty space.
 */
export function gridlines(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  let best: number[] = [];
  for (const steps of [2, 3, 4]) {
    const step = niceStep(max / steps);
    if (!best.length || step * steps < best[best.length - 1]) {
      best = Array.from({ length: steps + 1 }, (_, i) => i * step);
    }
  }
  return best;
}

/**
 * Gridlines for a chart that doesn't start at zero: two to four even, round
 * steps that just cover `min` to `max` (cents), like $45K, $47.5K, … $55K.
 */
export function valueTicks(min: number, max: number): number[] {
  if (!(max > min)) {
    const pad = Math.abs(max) * 0.1 || 100_00;
    min -= pad;
    max += pad;
  }
  let best: number[] = [];
  // On a tie, more lines win.
  for (const steps of [4, 3, 2]) {
    const step = niceStep((max - min) / steps);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const n = Math.round((hi - lo) / step);
    if (n > 5) continue;
    if (!best.length || hi - lo < best[best.length - 1] - best[0]) {
      best = Array.from({ length: n + 1 }, (_, i) => lo + i * step);
    }
  }
  return best;
}

/** 1, 2, 2.5 or 5 times a power of ten, at or above `x`. */
function niceStep(x: number): number {
  const power = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5]) if (m * power >= x) return m * power;
  return 10 * power;
}
