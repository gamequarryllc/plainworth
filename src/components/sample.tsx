import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { SampleContext } from '@/store';
import { hideSample } from '@/store/sample-hidden';
import { layout, useColors } from '@/theme';

import { Button } from './button';
import { Text } from './text';

/**
 * Everything inside draws from made-up sample data instead of the real data:
 * what a page looks like once it's in use, shown before anything is entered.
 */
export function SampleData({ children }: { children: ReactNode }) {
  return <SampleContext.Provider value={true}>{children}</SampleContext.Provider>;
}

/** Top of a sample page: says the numbers are made up, with a way to start and a way to hide it. */
export function SampleBanner({ action, icon, onAction }: { action: string; icon?: SFSymbol; onAction: () => void }) {
  const c = useColors();
  return (
    <View style={[styles.banner, { borderColor: c.separator }]}>
      <View style={styles.line}>
        <View style={[styles.badge, { backgroundColor: c.tint }]}>
          <Text variant="caption" weight="700" color={c.onTint} style={styles.badgeText}>
            SAMPLE
          </Text>
        </View>
        <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.note}>
          Made-up numbers. Yours go here.
        </Text>
      </View>
      <View style={styles.buttons}>
        <Button title={action} icon={icon} onPress={onAction} style={styles.button} />
        <Button title="Hide Sample" kind="tinted" onPress={hideSample} style={styles.button} />
      </View>
    </View>
  );
}

/** The sample page itself: it scrolls, but nothing in it can be tapped. */
export function SampleBody({ children }: { children: ReactNode }) {
  return (
    <View style={styles.body} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: layout.margin,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    gap: 10,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    letterSpacing: 0.4,
  },
  note: {
    flexShrink: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    marginHorizontal: 0,
    height: 38,
  },
  body: {
    pointerEvents: 'none',
  },
});
