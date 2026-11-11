import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/stack-options';

/** So the profile switcher can open Profiles directly, with Settings behind it to go back to. */
export const unstable_settings = { anchor: 'index' };

/** Settings opens as a sheet from the gear button, with its own pages inside. */
export default function SettingsLayout() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="sync" options={{ title: 'Sync with iCloud' }} />
      <Stack.Screen name="profiles" options={{ title: 'Profiles' }} />
      <Stack.Screen name="new-profile" options={{ title: 'New Profile' }} />
    </Stack>
  );
}
