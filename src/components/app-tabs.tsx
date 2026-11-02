import { NativeTabs } from 'expo-router/native-tabs';

import { useColors } from '@/theme';

/** The system tab bar (Liquid Glass on iOS 26). */
export default function AppTabs() {
  const c = useColors();
  return (
    <NativeTabs tintColor={c.tint}>
      <NativeTabs.Trigger name="(networth)">
        <NativeTabs.Trigger.Label>Net Worth</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="show_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="spending">
        <NativeTabs.Trigger.Label>Spending</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} md="credit_card" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="insights">
        <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} md="pie_chart" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
