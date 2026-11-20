import { Stack } from 'expo-router';

import { SampleScreen, startNetWorth, useNetWorthSample } from '@/components/sample';
import { useStackOptions } from '@/components/stack-options';
import { useResetOnTabBlur } from '@/hooks/use-reset-on-tab-blur';

export default function NetWorthLayout() {
  useResetOnTabBlur();
  const sample = useNetWorthSample();
  return (
    <Stack
      screenOptions={useStackOptions()}
      screenLayout={({ children, route }) => (
        <SampleScreen on={sample} start={startNetWorth} route={route}>
          {children}
        </SampleScreen>
      )}>
      <Stack.Screen name="index" options={{ title: 'Net Worth', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
