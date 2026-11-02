import { router } from 'expo-router';

import { useStore } from '@/store';

import type { HeaderItem } from './header-actions';

/**
 * The buttons at the top left of every tab: the gear that opens Settings, and
 * the eye that hides amounts everywhere (handy when someone can see the screen).
 */
export function useTabButtons(): HeaderItem[] {
  const hidden = useStore((s) => s.settings.hideAmounts);
  const updateSettings = useStore((s) => s.updateSettings);
  return [
    { label: 'Settings', icon: 'gearshape', onPress: () => router.push('/settings') },
    {
      label: hidden ? 'Show Amounts' : 'Hide Amounts',
      icon: hidden ? 'eye.slash' : 'eye',
      onPress: () => updateSettings({ hideAmounts: !hidden }),
    },
  ];
}
