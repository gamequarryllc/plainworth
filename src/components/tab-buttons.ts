import { router } from 'expo-router';

import { haptics } from '@/lib/haptics';
import { profileLabel } from '@/lib/profiles';
import { useStore } from '@/store';
import { useProfiles } from '@/store/profile-list';
import { switchProfile } from '@/store/profiles';

import type { HeaderItem } from './header-actions';

/**
 * The buttons at the top left of every tab: the gear that opens Settings, the
 * eye that hides amounts everywhere (handy when someone can see the screen),
 * and, once there's more than one profile, a menu to switch between them.
 */
export function useTabButtons(): HeaderItem[] {
  const hidden = useStore((s) => s.settings.hideAmounts);
  const updateSettings = useStore((s) => s.updateSettings);
  const profiles = useProfiles((s) => s.list);
  const active = useProfiles((s) => s.active);
  const items: HeaderItem[] = [
    { label: 'Settings', icon: 'gearshape', onPress: () => router.push('/settings') },
    {
      label: hidden ? 'Show Amounts' : 'Hide Amounts',
      icon: hidden ? 'eye.slash' : 'eye',
      onPress: () => updateSettings({ hideAmounts: !hidden }),
    },
  ];
  if (profiles.length > 1) {
    items.push({
      label: 'Profiles',
      icon: 'person.crop.circle',
      menu: [
        ...profiles.map((p) => ({
          label: profileLabel(p, profiles),
          isOn: p.id === active,
          onPress: () => {
            if (p.id === active) return;
            haptics.selection();
            switchProfile(p.id);
          },
        })),
        {
          inline: true,
          items: [
            {
              label: 'Edit Profiles',
              icon: 'person.2' as const,
              onPress: () => router.push('/settings/profiles', { withAnchor: true }),
            },
          ],
        },
      ],
    });
  }
  return items;
}
