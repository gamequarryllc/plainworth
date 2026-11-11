import { useEffect, useState } from 'react';
import { Switch } from 'react-native';

import { Row, Section } from '@/components/list';
import { ProBadge } from '@/components/pro-badge';
import { Screen } from '@/components/screen';
import { dateKey, formatDate, formatTime } from '@/lib/dates';
import { choose, confirm, notify } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';
import { profileLabel } from '@/lib/profiles';
import { contents } from '@/store/backup';
import { openPaywall, usePro } from '@/store/pro';
import { useProfiles } from '@/store/profile-list';
import {
  bringBackReplaced,
  cloudSupported,
  dismissStopped,
  lookAtCloud,
  syncNow,
  turnOffSync,
  turnOnSync,
  useSync,
} from '@/store/sync';

/** "just now", "5 min ago", "2 hr ago", then the day. */
function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} hr ago`;
  return formatDate(dateKey(new Date(at)), { year: false });
}

/**
 * Sync with iCloud: off unless turned on here. On, the person's data is also
 * kept in their own private iCloud so their other devices show the same thing.
 */
export default function SyncScreen() {
  const pro = usePro();
  const { on, busy, lastSynced, problem, stoppedElsewhere, replaced } = useSync();
  const profiles = useProfiles((s) => s.list);
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Keep "Synced 2 min ago" current while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const turnOn = async () => {
    if (!pro) {
      openPaywall('sync');
      return;
    }
    if (!cloudSupported) {
      notify(
        'Not in this version',
        'iCloud sync works in the App Store and TestFlight versions of Plainworth, not in Expo Go.',
      );
      return;
    }
    const ok = await confirm({
      title: 'Sync with iCloud?',
      message:
        'Your accounts, balances and spending will also be kept in your own private iCloud, so your other devices show the same thing. Only you can read it. You can turn this off at any time.',
      confirmLabel: 'Turn On',
    });
    if (!ok) return;
    setWorking(true);
    try {
      const seen = await lookAtCloud();
      if (!seen.available) {
        notify(
          'iCloud isn’t available',
          'Sign in to iCloud and turn on iCloud Drive in the Settings app, then try again.',
        );
        return;
      }
      // Only profiles with data both here and in iCloud need a choice. The rest are simply kept.
      let keep: 'device' | 'icloud' = 'icloud';
      if (seen.both.length) {
        const changedAt = Math.max(...seen.both.map((b) => b.cloud.changedAt));
        const where =
          profiles.length > 1
            ? ` in ${seen.both.map((b) => `“${profileLabel(profiles.find((p) => p.id === b.id)!, profiles)}”`).join(' and ')}`
            : '';
        const i = await choose({
          title: 'Which data do you want to keep?',
          message: `iCloud has ${contents(...seen.both.map((b) => b.cloud.data))}${where}, last changed ${formatDate(dateKey(new Date(changedAt)))}. This iPhone has ${contents(...seen.both.map((b) => b.local))}.\n\nThe other one is replaced on all your devices. A copy of it stays on this iPhone in case you change your mind.`,
          options: [{ label: 'Keep iCloud’s Data' }, { label: 'Keep This iPhone’s Data' }],
        });
        if (i == null) return;
        keep = i === 0 ? 'icloud' : 'device';
      }
      await turnOnSync(keep);
      haptics.success();
    } catch (e) {
      console.warn('Could not turn on sync', e);
      notify('Couldn’t turn on sync', 'iCloud couldn’t be reached. Check your connection and try again.');
    } finally {
      setWorking(false);
    }
  };

  const turnOff = async () => {
    const i = await choose({
      title: 'Turn off sync?',
      message:
        'Your data stays on this iPhone either way. You can also delete it from iCloud, which turns sync off on your other devices too. They keep what they have.',
      options: [{ label: 'Turn Off on This iPhone' }, { label: 'Turn Off and Delete from iCloud', destructive: true }],
    });
    if (i == null) return;
    setWorking(true);
    try {
      await turnOffSync(i === 1);
      if (i === 1)
        notify('Deleted from iCloud', 'Your data is now only on this iPhone and any other device that had it.');
    } catch (e) {
      console.warn('Could not delete from iCloud', e);
      notify(
        'Sync is off',
        'But iCloud couldn’t be reached to delete your data from it. Turn sync on and off again to retry.',
      );
    } finally {
      setWorking(false);
    }
  };

  const bringBack = async () => {
    if (!replaced) return;
    const whose = replaced.from === 'icloud' ? 'what was in iCloud' : 'what was on this iPhone';
    const ok = await confirm({
      title: 'Bring back the replaced data?',
      message: `This swaps in ${whose} on ${formatDate(dateKey(new Date(replaced.at)))}${on ? ', on all your devices' : ''}. What you see now is kept here instead, so you can swap back.`,
      confirmLabel: 'Bring Back',
    });
    if (!ok) return;
    if (bringBackReplaced()) haptics.success();
    else notify('Couldn’t bring it back', 'The saved copy couldn’t be read.');
  };

  const statusLine = !on
    ? stoppedElsewhere
      ? 'Sync was turned off from another device, and your data was deleted from iCloud. Everything is still on this iPhone.'
      : 'Off. Your data is only on this iPhone. Turn this on to keep the same data on your other devices through your own private iCloud. Plainworth has no servers, so only you can read it.'
    : problem === 'no-icloud'
      ? 'Not syncing. Sign in to iCloud and turn on iCloud Drive in the Settings app.'
      : problem === 'update-needed'
        ? 'Not syncing. Another device has a newer Plainworth. Update the app on this iPhone to carry on.'
        : problem === 'error'
          ? 'Couldn’t reach iCloud just now. Plainworth will keep trying.'
          : busy && !lastSynced
            ? 'Syncing…'
            : lastSynced
              ? `Synced ${ago(lastSynced, now)}${now - lastSynced < 60_000 ? '' : ` (${formatTime(lastSynced)})`}. Changes are saved on this iPhone first, then sent to your private iCloud.`
              : 'On.';

  return (
    <Screen title="Sync with iCloud">
      <Section footer={statusLine}>
        <Row
          title="Sync with iCloud"
          accessory={
            pro ? (
              <Switch
                value={on}
                disabled={working}
                onValueChange={(v) => {
                  if (stoppedElsewhere) dismissStopped();
                  if (v) turnOn();
                  else turnOff();
                }}
              />
            ) : (
              <ProBadge />
            )
          }
          onPress={pro ? undefined : () => openPaywall('sync')}
          chevron={false}
        />
        {on ? (
          <Row
            title="Sync Now"
            titleColor="tint"
            chevron={false}
            disabled={busy || working}
            onPress={() => syncNow()}
          />
        ) : null}
      </Section>

      {replaced ? (
        <Section
          footer={`Sync replaced ${replaced.from === 'icloud' ? 'what was in iCloud' : 'what was on this iPhone'} on ${formatDate(dateKey(new Date(replaced.at)))}. A copy is kept here in case you want it back.`}
        >
          <Row
            title="Bring Back Replaced Data"
            titleColor="tint"
            chevron={false}
            disabled={working}
            onPress={bringBack}
          />
        </Section>
      ) : null}

      <Section
        header="What Syncs"
        footer="The lock, Hide Amounts, reminders and how your lists and charts are set stay with each device. Plainworth Pro follows your Apple ID."
      >
        <Row title="Accounts and balances" chevron={false} />
        <Row title="Spending, income and notes" chevron={false} />
        <Row title="Categories, goals, name and currency" chevron={false} />
        {profiles.length > 1 ? <Row title="Every profile" chevron={false} /> : null}
      </Section>
    </Screen>
  );
}
