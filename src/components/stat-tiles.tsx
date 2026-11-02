import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout, useColors } from '@/theme';

import { Text } from './text';

export interface Tile {
  label: string;
  value: string;
  detail?: string;
  color?: 'up' | 'down' | 'text';
}

/** Two or three small figures side by side in one edge-to-edge strip, split by hairlines. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  const c = useColors();
  return (
    <View style={[styles.row, { backgroundColor: c.card, borderColor: c.separator }]}>
      {tiles.map((t, i) => (
        <Fragment key={t.label}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: c.separator }]} /> : null}
          <View style={styles.tile}>
            <Text variant="footnote" color="secondary" weight="500">
              {t.label}
            </Text>
            <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit color={t.color ?? 'text'}>
              {t.value}
            </Text>
            {t.detail ? (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {t.detail}
              </Text>
            ) : null}
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    flex: 1,
    paddingHorizontal: layout.margin,
    paddingVertical: 10,
    gap: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
});
