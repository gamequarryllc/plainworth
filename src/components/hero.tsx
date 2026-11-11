import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout } from '@/theme';

import { Text } from './text';

/** The big number at the top of a screen with a caption underneath. */
export function Hero({ label, value, caption }: { label?: string; value: string; caption?: ReactNode }) {
  return (
    <View style={styles.hero}>
      {label ? (
        <Text variant="subheadline" color="secondary" weight="500">
          {label}
        </Text>
      ) : null}
      <Text variant="display" tabular style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={styles.caption}>{caption}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: layout.margin,
    paddingTop: 2,
    paddingBottom: 14,
  },
  value: {
    marginTop: 2,
  },
  caption: {
    minHeight: 19,
  },
});
