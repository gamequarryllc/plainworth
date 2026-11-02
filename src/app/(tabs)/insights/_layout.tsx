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
 * Insights is part of Pro. Without it, each Insights page shows only its first
 * card, with a way to unlock the rest at the end of the page.
 */
function ProPreview({ children }: { children: ReactNode }) {
  const pro = usePro();
  if (pro) return <>{children}</>;
  return (
    <InsightsPreview
      footer={
        <UnlockCard
          feature="insights"
          title="See all your progress with Pro"
          text="This preview shows one card. Plainworth Pro adds this year against last, your streaks, lifestyle creep, and where your money went."
        />
      }>
      {children}
    </InsightsPreview>
  );
}
