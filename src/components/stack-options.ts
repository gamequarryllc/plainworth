import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';

import { useColors } from '@/theme';

type Options = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/** Shared look for every stack: native headers, minimal back button, grouped background. */
export function useStackOptions(): Options {
  const c = useColors();
  return {
    contentStyle: { backgroundColor: c.background },
    headerBackButtonDisplayMode: 'minimal',
    headerTintColor: c.tint,
    headerTitleStyle: { color: c.text },
    headerLargeTitleShadowVisible: false,
  };
}
