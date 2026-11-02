import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { InsightsPreview } from '@/components/insights-preview';
import { useStackOptions } from '@/components/stack-options';
import { useResetOnTabBlur } from '@/hooks/use-reset-on-tab-blur';
import { UnlockCard } from '@/components/unlock-card';
import { usePro } from '@/store/pro';

export default function InsightsLayout() {
  useResetOnTabBlur();
  return (
    <Stack screenOptions={useStackOptions()} screenLayout={({ children }) => <ProPreview>{children}</ProPreview>}>
      <Stack.Screen name="index" options={{ title: 'Insights', headerLargeTitleEnabled: true }} />
    </Stack>
  );
}

/**
 * Insights is part of Pro. Without it, every Insights screen shows only the
 * last two whole months, with a way to unlock the rest at the end of the page.
 */
function ProPreview({ children }: { children: ReactNode }) {
  const pro = usePro();
  if (pro) return <>{children}</>;
  return (
    <InsightsPreview
      footer={
        <UnlockCard
          feature="insights"
          title="See your whole year with Pro"
          text="This preview shows your last two months. Plainworth Pro shows every month of the year, how it compares with last year, and the years before."
        />
      }>
      {children}
    </InsightsPreview>
  );
}
