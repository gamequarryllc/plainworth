import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

import { Text } from './text';

/** The small "PRO" capsule next to things that need Plainworth Pro. */
export function ProBadge() {
  const c = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: c.fill }]} accessibilityLabel="Pro">
      <Text variant="caption" weight="700" color="tint" style={styles.text}>
        PRO
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  text: {
    letterSpacing: 0.4,
  },
});
