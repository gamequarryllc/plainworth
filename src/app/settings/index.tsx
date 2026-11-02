import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { ProBadge } from '@/components/pro-badge';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TimeField } from '@/components/time-field';
import { authenticate, biometricLabel, canAuthenticate, systemAppLock } from '@/lib/auth';
import { dayNumber, formatDate, todayKey } from '@/lib/dates';
import { choose, confirm, notify } from '@/lib/dialogs';
import { exportFileName, exportWorkbook } from '@/lib/export';
import { haptics } from '@/lib/haptics';
import { CURRENCIES } from '@/lib/money';
import { askForReminders, reminderPermission, type ReminderPermission } from '@/lib/notifications';
import { pickTextFile } from '@/lib/pick-file';
import { firstWeekday, formatReminder, MONTH_DAYS, monthDayName, reminderTimes, WEEKDAYS } from '@/lib/reminders';
import { BACKUP, EXCEL, shareFile } from '@/lib/share-file';
import type { Data, DateKey, Reminder, ReminderRepeat } from '@/lib/types';
import { currentData, flushSave, useStore } from '@/store';
import { BackupError, backupFileName, makeBackup, readBackup, type Backup } from '@/store/backup';
import { openPaywall, restorePurchases, setTestPro, useProStore } from '@/store/pro';
import { layout, useColors } from '@/theme';

const DEVICE = Platform.OS === 'android' ? 'phone' : 'iPhone';
// Set `extra.sourceCodeUrl` in app.json once the repository is public; until then the link and the sentence stay hidden.
const SOURCE_CODE_URL = Constants.expoConfig?.extra?.sourceCodeUrl as string | undefined;

export default function SettingsScreen() {
  const c = useColors();
  const settings = useStore((s) => s.settings);
  const hasData = useStore((s) => s.accounts.length > 0 || Object.keys(s.spend).length > 0);
  const [busy, setBusy] = useState(false);
  const updateSettings = useStore((s) => s.updateSettings);
  const eraseAll = useStore((s) => s.eraseAll);
  const restore = useStore((s) => s.restore);
  const loadSampleData = useStore((s) => s.loadSampleData);
  const proSource = useProStore((s) => s.source);
  const pro = proSource != null;
  const [lockLabel, setLockLabel] = useState('Face ID');
  // Newer iPhones lock apps from the Home Screen, so the switch is only for Android and older iOS.
  const ownLock = Platform.OS !== 'web' && !systemAppLock;

  useEffect(() => {
    if (ownLock) biometricLabel().then(setLockLabel);
  }, [ownLock]);

  const toggleLock = async (on: boolean) => {
    if (on) {
      if (!(await canAuthenticate())) {
        notify(
          `${lockLabel} isn't set up`,
          Platform.OS === 'android'
            ? 'Set up a screen lock in your phone’s Settings app first.'
            : `Turn on a passcode or ${lockLabel} in the Settings app first.`,
        );
        return;
      }
      if (!(await authenticate(`Turn on ${lockLabel}`))) return;
    }
    updateSettings({ requireUnlock: on });
  };

  const onExport = async () => {
    setBusy(true);
    try {
      const today = todayKey();
      await shareFile(exportFileName(today), exportWorkbook(currentData(), today), EXCEL, 'Export to Excel');
    } catch (e) {
      console.warn('Export failed', e);
      notify('Couldn’t export', 'Something went wrong making the spreadsheet. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onBackup = async () => {
    setBusy(true);
    try {
      const today = todayKey();
      await shareFile(backupFileName(today), makeBackup(currentData(), today), BACKUP, 'Back Up');
      updateSettings({ lastBackup: today });
    } catch (e) {
      console.warn('Backup failed', e);
      notify('Couldn’t back up', 'Something went wrong making the backup file. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    let backup: Backup;
    try {
      const text = await pickTextFile();
      if (text == null) return;
      backup = readBackup(text);
    } catch (e) {
      if (!(e instanceof BackupError)) console.warn('Restore failed', e);
      notify('Can’t restore this file', e instanceof BackupError ? e.message : 'It couldn’t be read. Please try again.');
      return;
    }
    const ok = await confirm({
      title: 'Restore this backup?',
      message: `${backup.date ? `The backup from ${formatDate(backup.date, { year: true })}` : 'This backup'} has ${contents(backup.data)}.${hasData ? ' It replaces everything in Plainworth now.' : ''}`,
      confirmLabel: 'Restore',
      destructive: hasData,
    });
    if (!ok) return;
    restore(backup.data, backup.date);
    await flushSave();
    haptics.success();
    notify('Backup restored', 'Everything from the backup is back in Plainworth.');
  };

  const onErase = async () => {
    const ok = await confirm({
      title: 'Erase all data?',
      message: `Every account, balance and month you entered will be deleted from this ${DEVICE}. This can’t be undone.`,
      confirmLabel: 'Erase Everything',
      destructive: true,
    });
    if (ok) {
      eraseAll();
      haptics.warning();
    }
  };

  const onSample = async () => {
    const ok = await confirm({
      title: 'Load sample data?',
      message: 'Replaces everything with made-up accounts and spending so you can try the app.',
      confirmLabel: 'Load Sample',
      destructive: true,
    });
    if (ok) loadSampleData();
  };

  const currencyName = CURRENCIES.find((x) => x.code === settings.currency)?.name ?? settings.currency;

  return (
    <Screen
      title="Settings"
      right={[{ label: 'Done', icon: 'checkmark', variant: 'done', onPress: () => router.back() }]}>
      <Section>
        <Row
          title="Plainworth Pro"
          subtitle={
            proSource === 'test' ? 'On for testing' : pro ? 'Lifetime · Thank you!' : 'Insights, exact chart values, Excel export'
          }
          onPress={() => openPaywall()}
        />
        {proSource !== 'lifetime' ? (
          <Row
            title="Restore Purchases"
            titleColor="tint"
            chevron={false}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await restorePurchases();
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
      </Section>

      <Section
        header="General"
        footer={
          systemAppLock
            ? 'To lock Plainworth with Face ID, touch and hold its icon on the Home Screen and choose Require Face ID.'
            : undefined
        }>
        <Row title="Currency" value={`${settings.currency} · ${currencyName}`} onPress={() => router.push('/settings/currency')} />
        <Row
          title="Hide Amounts"
          subtitle="Mask numbers when others can see your screen"
          accessory={<Switch value={settings.hideAmounts} onValueChange={(v) => updateSettings({ hideAmounts: v })} />}
        />
        {ownLock ? (
          <Row
            title={`Require ${lockLabel}`}
            accessory={<Switch value={settings.requireUnlock} onValueChange={toggleLock} />}
          />
        ) : null}
      </Section>

      <Reminders />

      <Section
        header="Backup"
        footer={`${backupStatus(settings.lastBackup)} Save the backup somewhere safe, like iCloud Drive or Google Drive. If you ever lose your ${DEVICE}, install Plainworth again and restore it.`}>
        <Row title="Back Up Now" titleColor="tint" chevron={false} disabled={!hasData || busy} onPress={onBackup} />
        <Row title="Restore from Backup" titleColor="tint" chevron={false} disabled={busy} onPress={onRestore} />
      </Section>

      <Section
        header="Export"
        footer="A spreadsheet of your net worth by month, every balance you’ve entered, and each year of spending. Handy for your own records or to send to a financial advisor. It opens in Excel, Numbers or Google Sheets.">
        <Row
          title="Export to Excel"
          titleColor="tint"
          chevron={false}
          disabled={(pro && !hasData) || busy}
          accessory={pro ? <Icon name="square.and.arrow.up" size={17} color={c.tint} /> : <ProBadge />}
          onPress={pro ? onExport : () => openPaywall('export')}
        />
      </Section>

      <Section>
        <Row title="Erase All Data" titleColor="down" onPress={onErase} chevron={false} />
      </Section>

      {__DEV__ ? (
        <Section header="Developer" footer="Only shown in development builds.">
          <Row
            title="Pro"
            subtitle="See Plainworth with or without Pro"
            accessory={<Switch value={pro} onValueChange={setTestPro} />}
          />
          <Row title="Load Sample Data" titleColor="tint" onPress={onSample} chevron={false} />
        </Section>
      ) : null}

      <PrivacyNote />
    </Screen>
  );
}

const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * A reminder to update balances, set on this phone (no server), weekly, every
 * two weeks or monthly. Tapping it opens Update Balances.
 */
function Reminders() {
  const reminder = useStore((s) => s.settings.reminder);
  const updateSettings = useStore((s) => s.updateSettings);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);

  useEffect(() => {
    const check = () => reminderPermission().then(setPermission);
    check();
    // Coming back from the Settings app after allowing notifications.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  const set = (patch: Partial<Reminder>) => {
    const next = { ...reminder, ...patch };
    // Every 2 weeks counts from the next one, so it starts this week or next, not in 3 weeks.
    if (next.repeat === 'biweekly' && (patch.repeat || patch.weekday != null || patch.on)) {
      next.start = firstWeekday(next.weekday, next.time, new Date());
    }
    updateSettings({ reminder: next });
  };

  const blocked = reminder.on && permission === 'denied';
  // While the permission is still being checked, show what was saved.
  const on = reminder.on && (permission == null || permission === 'granted');

  const toggle = async (value: boolean) => {
    if (!value) {
      set({ on: false });
      return;
    }
    if (await askForReminders()) {
      setPermission('granted');
      haptics.success();
      set({ on: true });
      return;
    }
    setPermission('denied');
    const open = await confirm({
      title: 'Notifications are off',
      message: `To get reminders, allow notifications for Plainworth in the Settings app.`,
      confirmLabel: 'Open Settings',
    });
    if (open) Linking.openSettings().catch(() => {});
  };

  const pickRepeat = async () => {
    const i = await choose({ title: 'Repeat', options: REPEATS.map((r) => ({ label: r.label })) });
    if (i != null) set({ repeat: REPEATS[i].value });
  };

  const pickDay = async () => {
    if (reminder.repeat === 'monthly') {
      const labels = ['1st of the Month', '15th of the Month', 'Last Day of the Month'];
      const i = await choose({ title: 'Day', options: labels.map((label) => ({ label })) });
      if (i != null) set({ monthDay: MONTH_DAYS[i] });
      return;
    }
    const i = await choose({ title: 'Day', options: WEEKDAYS.map((label) => ({ label })) });
    if (i != null) set({ weekday: i });
  };

  const now = new Date();
  const next = on ? reminderTimes(reminder, now, 1)[0] : undefined;
  const footer = blocked
    ? 'Notifications are turned off for Plainworth, so reminders can’t show. Turn them on in the Settings app.'
    : next
      ? `Next reminder: ${formatReminder(next, now)}. Tapping it opens Update Balances.`
      : `A nudge to update your balances and log your spending. It’s set on this ${DEVICE}, so nothing goes through a server.`;

  return (
    <Section header="Reminders" footer={footer}>
      <Row title="Update Reminder" accessory={<Switch value={on} onValueChange={toggle} />} />
      {on ? <Row title="Repeat" value={REPEATS.find((r) => r.value === reminder.repeat)!.label} onPress={pickRepeat} /> : null}
      {on ? (
        <Row
          title="Day"
          value={reminder.repeat === 'monthly' ? monthDayName(reminder.monthDay) : WEEKDAYS[reminder.weekday]}
          onPress={pickDay}
        />
      ) : null}
      {on ? <Row title="Time" accessory={<TimeField value={reminder.time} onChange={(time) => set({ time })} />} /> : null}
      {blocked ? (
        <Row title="Open Settings" titleColor="tint" chevron={false} onPress={() => Linking.openSettings().catch(() => {})} />
      ) : null}
    </Section>
  );
}

/** "Last backed up 3 days ago." No reminders: just the fact, where backups live. */
function backupStatus(last: DateKey | undefined): string {
  if (!last) return 'Not backed up yet.';
  const days = dayNumber(todayKey()) - dayNumber(last);
  if (days <= 0) return 'Last backed up today.';
  if (days === 1) return 'Last backed up yesterday.';
  return `Last backed up ${days} days ago.`;
}

/** "12 accounts and 22 months of spending". */
function contents(data: Data): string {
  const months = Object.values(data.spend).filter((m) => Object.values(m).some(Boolean)).length;
  const parts = [
    data.accounts.length ? `${data.accounts.length} ${data.accounts.length === 1 ? 'account' : 'accounts'}` : '',
    months ? `${months} ${months === 1 ? 'month' : 'months'} of spending` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : 'nothing in it yet';
}

/** The closing note: why Plainworth is safe to trust with your numbers. */
function PrivacyNote() {
  const c = useColors();
  return (
    <View style={styles.privacy}>
      <Icon name="lock.shield.fill" size={30} color={c.secondary} />
      <Text variant="subheadline" weight="600" color="secondary" style={styles.privacyTitle}>
        Private by Design
      </Text>
      <Text variant="footnote" color="secondary" align="center">
        Your data stays on this {DEVICE}. Plainworth has no servers, no sign-in and no bank connections, and it only goes
        online to fetch metal prices and to check a Pro purchase.{SOURCE_CODE_URL ? ' The source code is public, so anyone can check.' : ''}
      </Text>
      {SOURCE_CODE_URL ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => WebBrowser.openBrowserAsync(SOURCE_CODE_URL).catch(() => {})}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.5 }]}>
          <Text variant="footnote" weight="500" color="tint">
            View the Source Code
          </Text>
          <Icon name="arrow.up.right" size={10} weight="semibold" color={c.tint} />
        </Pressable>
      ) : null}
      <Text variant="caption" color="tertiary" style={styles.version}>
        Plainworth {Constants.expoConfig?.version ?? ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  privacy: {
    alignItems: 'center',
    marginTop: 36,
    marginHorizontal: layout.margin * 2.5,
  },
  privacyTitle: {
    marginTop: 8,
    marginBottom: 4,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 10,
  },
  version: {
    marginTop: 18,
  },
});
