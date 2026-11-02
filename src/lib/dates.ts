import type { DateKey, MonthKey } from './types';

const DAY_MS = 86_400_000;

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): DateKey {
  return dateKey(new Date());
}

export function parseDateKey(key: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/** Local Date at noon (noon avoids DST edge cases when handed to pickers). */
export function dateFromKey(key: DateKey): Date {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d, 12);
}

/** Whole days since the epoch. Timezone independent, so safe for chart x positions. */
export function dayNumber(key: DateKey): number {
  const { y, m, d } = parseDateKey(key);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function keyFromDayNumber(n: number): DateKey {
  const d = new Date(Math.floor(n) * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Same day `n` months away, clamped to the end of shorter months. */
export function addMonths(key: DateKey, n: number): DateKey {
  const { y, m, d } = parseDateKey(key);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, lastDay))}`;
}

export function formatDate(key: DateKey, opts: { year?: boolean } = {}): string {
  const { y, m, d } = parseDateKey(key);
  const showYear = opts.year ?? true;
  return `${MONTHS_SHORT[m - 1]} ${d}${showYear ? `, ${y}` : ''}`;
}

/** "2:05 PM", in local time. */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Yesterday", "3 days ago", then a short date. */
export function relativeDate(key: DateKey, today: DateKey = todayKey()): string {
  const diff = dayNumber(today) - dayNumber(key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  const sameYear = parseDateKey(key).y === parseDateKey(today).y;
  return formatDate(key, { year: !sameYear });
}

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${pad(month)}`;
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

export function shiftMonth(key: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const total = year * 12 + (month - 1) + n;
  const ny = Math.floor(total / 12);
  return monthKey(ny, total - ny * 12 + 1);
}

export function currentMonthKey(): MonthKey {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

export function formatMonth(key: MonthKey, opts: { year?: boolean } = {}): string {
  const { year, month } = parseMonthKey(key);
  return opts.year === false ? MONTHS[month - 1] : `${MONTHS[month - 1]} ${year}`;
}
