import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

/** Browser preview stand-in for the iOS tab bar. */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <Bar>
        <TabTrigger name="networth" href="/" asChild>
          <TabButton icon="chart.line.uptrend.xyaxis">Net Worth</TabButton>
        </TabTrigger>
        <TabTrigger name="spending" href="/spending" asChild>
          <TabButton icon="creditcard">Spending</TabButton>
        </TabTrigger>
        <TabTrigger name="insights" href="/insights" asChild>
          <TabButton icon="chart.pie">Insights</TabButton>
        </TabTrigger>
        </Bar>
      </TabList>
    </Tabs>
  );
}

function Bar(props: TabListProps) {
  const c = useColors();
  return <View {...props} style={[styles.bar, { backgroundColor: c.background, borderTopColor: c.separator }]} />;
}

function TabButton({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon: SFSymbol }) {
  const c = useColors();
  const color = isFocused ? c.text : c.tertiary;
  return (
    <Pressable {...(props as PressableProps)} style={styles.button}>
      <View style={styles.inner}>
        <Icon name={icon} size={24} color={color} />
        <Text variant="caption" weight="500" color={color}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 20,
    paddingTop: 6,
  },
  button: {
    flex: 1,
  },
  inner: {
    alignItems: 'center',
    gap: 2,
  },
});
