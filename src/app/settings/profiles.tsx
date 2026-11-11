import { router } from 'expo-router';
import { useState } from 'react';

import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { ProBadge } from '@/components/pro-badge';
import { Screen } from '@/components/screen';
import { SwipeGroup, SwipeRow } from '@/components/swipe-row';
import { confirm, notify } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';
import { MAIN, profileLabel, PROFILE_MAX, type Profile } from '@/lib/profiles';
import { isEmpty } from '@/lib/sync/merge';
import { contents } from '@/store/backup';
import { openPaywall, usePro } from '@/store/pro';
import { useProfiles } from '@/store/profile-list';
import { canAddProfile, deleteProfile, profileData, switchProfile } from '@/store/profiles';
import { useSync } from '@/store/sync';
import { useColors } from '@/theme';

/** "3 accounts and 12 months of spending", or "Empty". */
function summary(id: string): string {
  const data = profileData(id);
  return isEmpty(data) ? 'Empty' : contents(data);
}

/**
 * Profiles: separate sets of accounts, spending and Insights, like one for
 * you, one for a child and one for a business. Adding one is Pro; opening and
 * deleting the ones already there never is, so nobody's data gets locked away.
 */
export default function ProfilesScreen() {
  const c = useColors();
  const pro = usePro();
  const list = useProfiles((s) => s.list);
  const active = useProfiles((s) => s.active);
  const syncOn = useSync((s) => s.on);
  const [swipes] = useState(() => new SwipeGroup());

  const open = (id: string) => {
    if (id === active) return;
    haptics.selection();
    switchProfile(id);
  };

  const add = () => {
    if (!pro) openPaywall('profiles');
    else if (!canAddProfile()) notify('That’s the most profiles', `Plainworth keeps up to ${PROFILE_MAX}. Delete one to add another.`);
    else router.push('/settings/new-profile');
  };

  const remove = async (profile: Profile, close: () => void) => {
    const name = profileLabel(profile, list);
    const data = profileData(profile.id);
    const ok = await confirm({
      title: `Delete “${name}”?`,
      message: `${isEmpty(data) ? 'This profile' : `This profile and its ${contents(data)}`} will be deleted from this iPhone${syncOn ? ' and, because sync is on, from your other devices and iCloud' : ''}. This can’t be undone.`,
      confirmLabel: 'Delete Profile',
      destructive: true,
    });
    if (!ok) {
      close();
      return;
    }
    deleteProfile(profile.id);
    haptics.warning();
  };

  const row = (p: Profile) => (
    <Row
      key={p.id}
      title={profileLabel(p, list)}
      subtitle={summary(p.id)}
      accessory={p.id === active ? <Icon name="checkmark" size={16} weight="semibold" color={c.tint} /> : undefined}
      onPress={() => open(p.id)}
      chevron={false}
      accessibilityLabel={`${profileLabel(p, list)}${p.id === active ? ', open' : ''}`}
    />
  );

  return (
    <Screen title="Profiles">
      <Section
        footer={
          list.length > 1
            ? 'Tap a profile to open it. Swipe left to delete one. To rename the open one, change Name in Settings.'
            : 'Each profile has its own accounts, spending and Insights. Add one for a child, a partner or a business.'
        }>
        {list.map((p) =>
          // The first profile stays: Erase All Data empties it.
          p.id === MAIN ? (
            row(p)
          ) : (
            <SwipeRow
              key={p.id}
              group={swipes}
              actions={[{ label: 'Delete', color: c.down, onPress: (close) => remove(p, close) }]}>
              {row(p)}
            </SwipeRow>
          ),
        )}
      </Section>
      <Section>
        <Row
          title="Add Profile"
          titleColor="tint"
          chevron={false}
          accessory={pro ? undefined : <ProBadge />}
          onPress={add}
        />
      </Section>
    </Screen>
  );
}
