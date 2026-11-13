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
 * Insights is part of Pro. Without it, every card's chart is blurred behind
 * an Unlock with Pro tag, with a way to unlock them at the end of the page.
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
          text="Plainworth Pro unlocks every chart here with your own numbers, and lets you drag across each one."
        />
      }>
      {children}
    </InsightsPreview>
  );
}
