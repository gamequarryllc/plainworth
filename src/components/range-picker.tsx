import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { RANGES } from '@/lib/networth';
import type { RangeKey } from '@/lib/types';
import { layout, useColors } from '@/theme';

import { Text } from './text';

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  const c = useColors();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {RANGES.map((r) => {
        const selected = r.key === value;
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
            hitSlop={6}
            style={[styles.pill, selected && { backgroundColor: c.fillStrong }]}>
            <Text variant="footnote" weight="600" color={selected ? 'text' : 'secondary'}>
              {r.label}
            </Text>
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
  pill: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
    alignItems: 'center',
  },
});
