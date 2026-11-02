import type { Reminder } from './types';

// The browser preview has no reminders: the settings can be tried, but nothing is scheduled.

export type ReminderPermission = 'granted' | 'undetermined' | 'denied';

export async function reminderPermission(): Promise<ReminderPermission> {
  return 'granted';
}

export async function askForReminders(): Promise<boolean> {
  return true;
}

export async function syncReminders(_reminder: Reminder): Promise<void> {}

export function useReminderTaps() {}
