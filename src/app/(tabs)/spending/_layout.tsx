import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/stack-options';
import { useResetOnTabBlur } from '@/hooks/use-reset-on-tab-blur';

export default function SpendingLayout() {
  useResetOnTabBlur();
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Spending', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
