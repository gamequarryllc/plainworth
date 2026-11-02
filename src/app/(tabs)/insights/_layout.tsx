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
 * Insights is part of Pro. Without it, every card shows the shape of its
 * chart with the numbers hidden, with a way to unlock them at the end of the page.
 */
function ProPreview({ children }: { children: ReactNode }) {
  const pro = usePro();
  if (pro) return <>{children}</>;
  return (
    <InsightsPreview
      footer={
        <UnlockCard
          feature="insights"
          title="See your numbers with Pro"
          text="These charts are drawn from your own data. Plainworth Pro shows the numbers behind them, the answers, and lets you drag across each chart."
        />
      }>
      {children}
    </InsightsPreview>
  );
}
