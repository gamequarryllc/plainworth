import { StyleSheet, View } from 'react-native';

import { formatPercent } from '@/lib/money';
import { layout, useColors } from '@/theme';

import { Text } from './text';

/** A category total with a thin bar showing its share. */
export function ShareRow({ title, value, share, color }: { title: string; value: string; share: number; color: string }) {
  const c = useColors();
  return (
    <View style={[styles.row, { minHeight: layout.rowHeight }]}>
      <View style={styles.top}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text tabular>{value}</Text>
      </View>
      <View style={styles.bottom}>
        <View style={[styles.track, { backgroundColor: c.fill }]}>
          <View style={[styles.fill, { width: `${Math.max(1.5, share * 100)}%`, backgroundColor: color }]} />
        </View>
        <Text variant="footnote" color="secondary" tabular style={styles.pct}>
          {formatPercent(share)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: layout.margin,
    paddingVertical: 8,
    gap: 7,
    justifyContent: 'center',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  title: {
    flex: 1,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  pct: {
    minWidth: 48,
    textAlign: 'right',
  },
});
