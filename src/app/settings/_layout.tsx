import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/stack-options';

/** Settings opens as a sheet from the gear button, with its own pages inside. */
export default function SettingsLayout() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
    </Stack>
  );
}
