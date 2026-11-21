import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { InsightsPreview } from '@/components/insights-preview';
import { SampleScreen, startNetWorth } from '@/components/sample';
import { useStackOptions } from '@/components/stack-options';
import { useResetOnTabBlur } from '@/hooks/use-reset-on-tab-blur';
import { UnlockCard } from '@/components/unlock-card';
import { firstYear } from '@/lib/insights';
import { useStore } from '@/store';
import { usePro } from '@/store/pro';
import { usePreviewing, useSampleOn } from '@/store/sample-hidden';

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

/** True while Insights shows the sample: nothing entered yet, and not hidden. */
function useInsightsSample(): boolean {
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const sampleOn = useSampleOn();
  const previewing = usePreviewing();
  return (sampleOn && firstYear({ snapshots, spend }) == null) || previewing;
}

/**
 * Insights is part of Pro. Without it, every card's chart is blurred behind
 * an Unlock with Pro tag, with a way to unlock them at the end of the page.
 * The sample is the exception: it shows all of Pro, so it can be tried first.
 */
function ProPreview({ children }: { children: ReactNode }) {
  const pro = usePro();
  const sample = useInsightsSample();
  if (pro || sample) return <>{children}</>;
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
  const sample = useInsightsSample();
  return (
    <SampleScreen on={sample} start={startNetWorth} route={route}>
      {children}
    </SampleScreen>
  );
}
