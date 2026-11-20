import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { InsightsPreview, useInsightsPreview } from '@/components/insights-preview';
import { SampleScreen, startNetWorth } from '@/components/sample';
import { useStackOptions } from '@/components/stack-options';
import { useResetOnTabBlur } from '@/hooks/use-reset-on-tab-blur';
import { UnlockCard } from '@/components/unlock-card';
import { firstYear } from '@/lib/insights';
import { useStore } from '@/store';
import { usePro } from '@/store/pro';
import { useSampleOn } from '@/store/sample-hidden';

export default function InsightsLayout() {
  useResetOnTabBlur();
  return (
    <Stack screenOptions={useStackOptions()} screenLayout={({ children, route }) => (
        <ProPreview>
          <InsightsSample route={route}>{children}</InsightsSample>
        </ProPreview>
      )}>
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

/**
 * While Insights shows the sample (nothing entered yet), the pages opened
 * from its cards show the sample too.
 */
function InsightsSample({ route, children }: { route: { name: string; params?: object }; children: ReactNode }) {
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const preview = useInsightsPreview();
  const sampleOn = useSampleOn();
  // Like the page itself: without Pro, Insights is the blurred preview instead.
  const sample = !preview && sampleOn && firstYear({ snapshots, spend }) == null;
  return (
    <SampleScreen on={sample} start={startNetWorth} route={route}>
      {children}
    </SampleScreen>
  );
}
