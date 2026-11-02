import { Platform } from 'react-native';

import { confirm } from '@/lib/dialogs';
import { askForReminders, reminderPermission } from '@/lib/notifications';
import { storage } from '@/lib/storage';

import { useStore } from './index';

/** Set once the offer has been made (or reminders were set up in Settings), so it's never made twice on this phone. */
const OFFERED = 'plainworth.reminder.offered';

export function markReminderOffered() {
  storage.write(OFFERED, '1').catch(() => {});
}

/** For trying the offer again in development. */
export function resetReminderOffer() {
  storage.remove(OFFERED).catch(() => {});
}

function offered(): boolean {
  try {
    return storage.read(OFFERED) != null;
  } catch {
    return true;
  }
}

/**
 * Offer the monthly reminder once, right after someone adds an account or
 * updates their balances: the moment a reminder makes sense. iPhone lets an
 * app ask for notifications only once, so Plainworth explains first and asks
 * iOS only after a yes. Yes means the 1st of each month at 9:00 AM, which can
 * be changed or turned off in Settings › Reminders.
 */
export function offerReminder() {
  if (Platform.OS === 'web' || offered() || useStore.getState().settings.reminder.on) return;
  // Wait for the sheet to finish closing.
  setTimeout(async () => {
    if (offered() || useStore.getState().settings.reminder.on) return;
    markReminderOffered();
    // Notifications turned off for Plainworth in the Settings app: don't ask.
    if ((await reminderPermission()) === 'denied') return;
    const yes = await confirm({
      title: 'Remind you each month?',
      message:
        'Plainworth can remind you on the 1st of each month to update your balances. You can change the day or turn it off in Settings.',
      confirmLabel: 'Remind Me',
      cancelLabel: 'Not Now',
    });
    if (!yes || !(await askForReminders())) return;
    const { settings, updateSettings } = useStore.getState();
    updateSettings({ reminder: { ...settings.reminder, on: true } });
  }, 700);
}
