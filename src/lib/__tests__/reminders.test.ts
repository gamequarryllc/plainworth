import assert from 'node:assert/strict';
import { test } from 'node:test';

import { firstWeekday, formatReminder, reminderText, reminderTimes } from '../reminders';
import type { Reminder } from '../types';

const base: Reminder = { on: true, repeat: 'monthly', weekday: 0, monthDay: 1, time: 9 * 60 };
const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

test('reminders: monthly on the 1st, the 15th and the last day', () => {
  // Monday, November 2, 2026, 10:30.
  const now = new Date(2026, 10, 2, 10, 30);
  assert.deepEqual(reminderTimes(base, now, 3).map(local), ['2026-12-01 09:00', '2027-01-01 09:00', '2027-02-01 09:00']);
  assert.deepEqual(reminderTimes({ ...base, monthDay: 15, time: 20 * 60 + 15 }, now, 2).map(local), [
    '2026-11-15 20:15',
    '2026-12-15 20:15',
  ]);
  assert.deepEqual(reminderTimes({ ...base, monthDay: 0 }, new Date(2027, 0, 31, 12), 3).map(local), [
    '2027-02-28 09:00',
    '2027-03-31 09:00',
    '2027-04-30 09:00',
  ]);
  // Earlier the same day still counts.
  assert.equal(local(reminderTimes(base, new Date(2026, 11, 1, 8, 59), 1)[0]), '2026-12-01 09:00');
  assert.equal(reminderTimes(base, now).length, 12);
});

test('reminders: weekly and every 2 weeks', () => {
  const now = new Date(2026, 10, 2, 10, 30);
  const weekly: Reminder = { ...base, repeat: 'weekly', weekday: 0 };
  assert.deepEqual(reminderTimes(weekly, now, 3).map(local), ['2026-11-08 09:00', '2026-11-15 09:00', '2026-11-22 09:00']);
  // Today (a Monday) at 6 PM hasn't passed yet.
  assert.equal(local(reminderTimes({ ...weekly, weekday: 1, time: 18 * 60 }, now, 1)[0]), '2026-11-02 18:00');

  assert.equal(firstWeekday(0, 9 * 60, now), '2026-11-08');
  assert.equal(firstWeekday(1, 18 * 60, now), '2026-11-02');
  assert.equal(firstWeekday(1, 9 * 60, now), '2026-11-09');

  const biweekly: Reminder = { ...base, repeat: 'biweekly', weekday: 0, start: '2026-11-08' };
  assert.deepEqual(reminderTimes(biweekly, now, 3).map(local), ['2026-11-08 09:00', '2026-11-22 09:00', '2026-12-06 09:00']);
  // Weeks later it keeps to the same weeks.
  assert.deepEqual(reminderTimes(biweekly, new Date(2027, 0, 5), 2).map(local), ['2027-01-17 09:00', '2027-01-31 09:00']);
  assert.deepEqual(reminderTimes(biweekly, new Date(2026, 11, 20, 9, 0), 1).map(local), ['2027-01-03 09:00']);
  // A start that doesn't match the weekday starts over from the next one.
  assert.equal(local(reminderTimes({ ...biweekly, weekday: 3 }, now, 1)[0]), '2026-11-04 09:00');
});

test('reminders: what they say', () => {
  assert.equal(
    reminderText(base, new Date(2026, 11, 1, 9)),
    'Time for your monthly check-in. Update your balances and log November’s spending.',
  );
  assert.equal(
    reminderText(base, new Date(2027, 0, 1, 9)),
    'Time for your monthly check-in. Update your balances and log December’s spending.',
  );
  assert.equal(
    reminderText({ ...base, monthDay: 0 }, new Date(2026, 10, 30, 9)),
    'Time for your monthly check-in. Update your balances and log November’s spending.',
  );
  assert.equal(reminderText({ ...base, repeat: 'weekly' }, new Date()), 'Time to update your balances. It takes about a minute.');

  const now = new Date(2026, 10, 2, 10, 30);
  assert.equal(formatReminder(new Date(2026, 10, 2, 18), now), 'Today at 6:00 PM');
  assert.equal(formatReminder(new Date(2026, 10, 3, 9), now), 'Tomorrow at 9:00 AM');
  assert.equal(formatReminder(new Date(2026, 10, 8, 9), now), 'Sunday, November 8 at 9:00 AM');
});
