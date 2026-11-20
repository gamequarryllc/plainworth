import { Stack } from 'expo-router';

import { SampleScreen, startSpending, useSpendingSample } from '@/components/sample';
import { useStackOptions } from '@/components/stack-options';
import { useResetOnTabBlur } from '@/hooks/use-reset-on-tab-blur';

export default function SpendingLayout() {
  useResetOnTabBlur();
  const sample = useSpendingSample();
  return (
    <Stack
      screenOptions={useStackOptions()}
      screenLayout={({ children, route }) => (
        <SampleScreen on={sample} start={startSpending} route={route}>
          {children}
        </SampleScreen>
      )}>
      <Stack.Screen name="index" options={{ title: 'Spending', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
