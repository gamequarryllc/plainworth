import { router } from 'expo-router';
import { useEffect } from 'react';
import { LogBox, Platform } from 'react-native';

import { AHEAD, reminderText, reminderTimes } from './reminders';
import type { Reminder } from './types';

// Expo Go warns about push notifications on import. Plainworth only sets local
// reminders on the phone, which Expo Go runs fine, so the warning is noise.
LogBox.ignoreLogs(['`expo-notifications` functionality is not fully supported in Expo Go']);
// Loaded after the line above so the warning is already filtered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = require('expo-notifications') as typeof import('expo-notifications');

/** Android groups notifications into channels people can mute in Settings. */
const CHANNEL = 'reminders';
/** Where tapping a reminder goes. */
const OPENS = '/update-all';

export type ReminderPermission = 'granted' | 'undetermined' | 'denied';

function permissionOf(p: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>): ReminderPermission {
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Whether Plainworth may show notifications on this phone. */
export async function reminderPermission(): Promise<ReminderPermission> {
  try {
    return permissionOf(await Notifications.getPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** Ask to show notifications, if the phone still lets us ask. True when allowed. */
export async function askForReminders(): Promise<boolean> {
  try {
    const now = permissionOf(await Notifications.getPermissionsAsync());
    if (now !== 'undetermined') return now === 'granted';
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return permissionOf(asked) === 'granted';
  } catch (e) {
    console.warn('Could not ask for notifications', e);
    return false;
  }
}

let latest: Reminder | null = null;
let queue: Promise<void> = Promise.resolve();

/**
 * Set up the next reminders, replacing any set before. Called when the
 * reminder changes and each time the app opens, which keeps the month names
 * right and the reminders topped up. Calls run one at a time, using the newest
 * settings, so quick changes can't leave doubles behind.
 */
export function syncReminders(reminder: Reminder): Promise<void> {
  latest = reminder;
  queue = queue.then(async () => {
    const r = latest;
    if (!r) return;
    latest = null;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (!r.on || (await reminderPermission()) !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: 'Update reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      for (const when of reminderTimes(r, new Date(), AHEAD)) {
        await Notifications.scheduleNotificationAsync({
          content: { body: reminderText(r, when), data: { url: OPENS } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: when,
            ...(Platform.OS === 'android' ? { channelId: CHANNEL } : null),
          },
        });
      }
    } catch (e) {
      console.warn('Could not set up reminders', e);
    }
  });
  return queue;
}

/** Tapping a reminder opens Update Balances, whether the app was open or not. */
export function useReminderTaps() {
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      if (data?.url !== OPENS) return;
      Notifications.clearLastNotificationResponse();
      router.push(OPENS);
    };
    try {
      open(Notifications.getLastNotificationResponse()?.notification.request.content.data);
    } catch {
      // Not available on this platform.
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}
