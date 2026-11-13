import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';

import { layout, useColors, type Colors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

const ACCOUNTS: { label: string; icon: SFSymbol; color: keyof Colors }[] = [
  { label: 'Checking', icon: 'building.columns', color: 'tint' },
  { label: 'Savings', icon: 'banknote', color: 'up' },
  { label: 'Cards', icon: 'creditcard', color: 'warning' },
  { label: 'Brokerage', icon: 'chart.line.uptrend.xyaxis', color: 'invest' },
];

const TILE = 52;
/** How far a statement falls, from under its account to the month. */
const DROP = 46;
const STAGGER = 380;
const FALL = 900;
const LOOP = STAGGER * ACCOUNTS.length + FALL + 900;

/**
 * The picture at the top of the import screen: the kinds of account to bring
 * a statement from, each dropping a page into the month. Still when Reduce
 * Motion is on.
 */
export function ImportHero({ month }: { month: string }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  return (
    <View
      style={[styles.hero, { backgroundColor: c.card }]}
      accessible
      accessibilityLabel={`Add ${month}'s statements from checking, savings, cards and brokerage`}>
      <View style={styles.accounts} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {ACCOUNTS.map((a, i) => (
          <View key={a.label} style={styles.account}>
            <View style={[styles.tile, { backgroundColor: c.fill }]}>
              <Icon name={a.icon} size={24} color={c[a.color]} />
            </View>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {a.label}
            </Text>
            {width ? <Page index={i} color={c[a.color]} toCenter={width / 2 - ((i + 0.5) * width) / ACCOUNTS.length} /> : null}
          </View>
        ))}
      </View>
      <Month name={month} />
    </View>
  );
}

function Page({ index, color, toCenter }: { index: number; color: string; toCenter: number }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    const wait = index * STAGGER;
    t.value = withRepeat(
      withSequence(
        withDelay(wait, withTiming(1, { duration: FALL, easing: Easing.inOut(Easing.cubic) })),
        withTiming(1, { duration: LOOP - wait - FALL }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
    return () => cancelAnimation(t);
  }, [index, still, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : t.value < 0.15 ? t.value / 0.15 : t.value > 0.8 ? (1 - t.value) / 0.2 : 1,
    transform: [{ translateY: t.value * DROP }, { translateX: t.value * t.value * toCenter }, { scale: 1 - t.value * 0.3 }],
  }));
  if (still) return null;
  return (
    <Animated.View style={[styles.page, style]} pointerEvents="none">
      <Icon name="doc.fill" size={16} color={color} />
    </Animated.View>
  );
}

function Month({ name }: { name: string }) {
  const c = useColors();
  const still = useReducedMotion();
  const beat = useSharedValue(1);
  useEffect(() => {
    if (still) return;
    // A small bump each time a page lands; one bump lasts as long as the gap between pages.
    const bump = withSequence(withTiming(1.06, { duration: 140 }), withTiming(1, { duration: STAGGER - 140 }));
    beat.value = withRepeat(
      withSequence(
        withDelay(FALL - 140, bump),
        ...ACCOUNTS.slice(1).map(() => bump),
        withTiming(1, { duration: LOOP - (FALL - 140) - STAGGER * ACCOUNTS.length }),
      ),
      -1,
    );
    return () => cancelAnimation(beat);
  }, [beat, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));
  return (
    <Animated.View style={[styles.month, { backgroundColor: c.tint }, style]}>
      <Icon name="calendar" size={16} weight="semibold" color="#FFFFFF" />
      <Text variant="headline" color="#FFFFFF">
        {name}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: layout.margin,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 34,
  },
  accounts: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  account: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    position: 'absolute',
    top: TILE + 24,
  },
  month: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    height: 36,
    borderRadius: 18,
  },
});
