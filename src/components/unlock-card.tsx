import { StyleSheet, View } from 'react-native';

import { LIFETIME_PRICE, PRO_FEATURES, type ProFeature } from '@/lib/pro';
import { openPaywall, useProStore } from '@/store/pro';
import { layout, useColors } from '@/theme';

import { Button } from './button';
import { ProBadge } from './pro-badge';
import { Text } from './text';

/**
 * The end of a Pro preview: what the rest of it holds and a way to unlock it.
 * Edge to edge with hairlines, like the cards above it.
 */
export function UnlockCard({ feature, title, text }: { feature: ProFeature; title?: string; text?: string }) {
  const c = useColors();
  const price = useProStore((s) => s.offer?.price) ?? LIFETIME_PRICE;
  const info = PRO_FEATURES.find((f) => f.key === feature)!;
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.separator }]}>
      <View style={styles.badge}>
        <ProBadge />
      </View>
      <Text variant="headline">{title ?? info.title}</Text>
      <Text variant="subheadline" color="secondary" style={styles.text}>
        {text ?? info.text}
      </Text>
      <Button title="Unlock Pro" onPress={() => openPaywall(feature)} style={styles.button} />
      <Text variant="footnote" color="secondary" align="center">
        Pay once, {price}. Yours for good.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 24,
    paddingHorizontal: layout.margin,
    paddingTop: 16,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  text: {
    marginTop: 4,
  },
  button: {
    marginHorizontal: 0,
    marginTop: 16,
    marginBottom: 10,
  },
});
