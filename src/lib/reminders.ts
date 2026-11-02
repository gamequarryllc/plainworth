import { dateKey, dayNumber, formatTime, MONTHS, parseDateKey } from './dates';
import type { DateKey, Reminder } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The days a monthly reminder can fall on: the 1st, the 15th, or the last day (0). */
export const MONTH_DAYS = [1, 15, 0];

/** "1st", "15th", "Last Day". */
export function monthDayName(day: number): string {
  return day === 0 ? 'Last Day' : day === 1 ? '1st' : day === 15 ? '15th' : `${day}th`;
}

/** How many reminders to set up ahead. iOS keeps at most 64 per app; these are topped up each time the app opens. */
export const AHEAD = 12;

const at = (y: number, m: number, d: number, minutes: number) => new Date(y, m, d, Math.floor(minutes / 60), minutes % 60);

/**
 * The next day on or after `from` that falls on `weekday` and whose reminder
 * time hasn't passed yet: where a new "every 2 weeks" reminder starts.
 */
export function firstWeekday(weekday: number, time: number, from: Date): DateKey {
  for (let k = 0; k < 8; k++) {
    const d = at(from.getFullYear(), from.getMonth(), from.getDate() + k, time);
    if (d.getDay() === weekday && d > from) return dateKey(d);
  }
  return dateKey(from);
}

/** When the next `count` reminders come, after `now`, in local time. */
export function reminderTimes(r: Reminder, now: Date, count = AHEAD): Date[] {
  const out: Date[] = [];
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (r.repeat === 'monthly') {
    for (let k = 0; out.length < count && k < count + 2; k++) {
      const last = new Date(y, m + k + 1, 0).getDate();
      const day = r.monthDay === 0 ? last : Math.min(r.monthDay, last);
      const when = at(y, m + k, day, r.time);
      if (when > now) out.push(when);
    }
    return out;
  }
  if (r.repeat === 'weekly') {
    for (let k = 0; out.length < count && k < count * 7 + 7; k++) {
      const when = at(y, m, d + k, r.time);
      if (when.getDay() === r.weekday && when > now) out.push(when);
    }
    return out;
  }
  // Every 2 weeks, counted from the first one so it keeps to the same weeks.
  const start = r.start && parseDateKey(r.start);
  if (!start || new Date(start.y, start.m - 1, start.d).getDay() !== r.weekday) {
    const first = parseDateKey(firstWeekday(r.weekday, r.time, now));
    return Array.from({ length: count }, (_, k) => at(first.y, first.m - 1, first.d + 14 * k, r.time));
  }
  const behind = Math.max(0, Math.floor((dayNumber(dateKey(now)) - dayNumber(r.start!)) / 14));
  for (let k = behind; out.length < count; k++) {
    const when = at(start.y, start.m - 1, start.d + 14 * k, r.time);
    if (when > now) out.push(when);
  }
  return out;
}

/**
 * What the reminder says. Monthly ones name the month to log: on the 1st and
 * the 15th that's the month before, on the last day it's the month ending.
 */
export function reminderText(r: Reminder, when: Date): string {
  if (r.repeat !== 'monthly') return 'Time to update your balances. It takes about a minute.';
  const month = r.monthDay === 0 ? when.getMonth() : (when.getMonth() + 11) % 12;
  return `Time for your monthly check-in. Update your balances and log ${MONTHS[month]}’s spending.`;
}

/** "Today at 9:00 AM", "Tomorrow at 9:00 AM", or "Sunday, November 1 at 9:00 AM". */
export function formatReminder(when: Date, now: Date): string {
  const days = dayNumber(dateKey(when)) - dayNumber(dateKey(now));
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : `${WEEKDAYS[when.getDay()]}, ${MONTHS[when.getMonth()]} ${when.getDate()}`;
  return `${day} at ${formatTime(when.getTime())}`;
}
