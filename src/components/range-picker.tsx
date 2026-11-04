import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { RANGES } from '@/lib/networth';
import type { RangeKey } from '@/lib/types';
import { layout, useColors } from '@/theme';

import { Text } from './text';

export function RangePicker({
  value,
  onChange,
  style,
  locked,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
  style?: StyleProp<ViewStyle>;
  /** In a card that opens Pro when tapped: drawn the same, but not buttons of their own. */
  locked?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.row, style]} accessibilityRole="tablist">
      {RANGES.map((r) => {
        const selected = r.key === value;
        const label = (
          <Text variant="footnote" weight="600" color={selected ? 'text' : 'secondary'}>
            {r.label}
          </Text>
        );
        if (locked) {
          return (
            <View key={r.key} style={[styles.pill, selected && { backgroundColor: c.fillStrong }]}>
              {label}
            </View>
          );
        }
        return (
          <Pressable
            key={r.key}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(r.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={r.caption}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            style={[styles.pill, selected && { backgroundColor: c.fillStrong }]}>
            {label}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: layout.margin,
    marginTop: 8,
  },
  // Nine ranges fit on a 375 pt wide iPhone SE: each pill is only as wide as its label.
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 13,
    alignItems: 'center',
  },
});
