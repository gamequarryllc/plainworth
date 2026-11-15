import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

/**
 * A value with iOS's − | + stepper beside it, for a list row: "4%  [− | +]".
 * Steps through `options`, so the ends are where the list stops.
 */
export function MiniStepper<T>({
  value,
  options,
  onChange,
  format,
  accessibilityLabel,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  format: (value: T) => string;
  accessibilityLabel: string;
}) {
  const c = useColors();
  // A value that isn't one of the steps is still shown as it is, and steps from the nearest one.
  const i = nearestIndex(options, value);
  const button = (icon: 'minus' | 'plus', to: number, label: string) => {
    const enabled = to >= 0 && to < options.length;
    return (
      <Pressable
        onPress={() => {
          haptics.selection();
          onChange(options[to]);
        }}
        disabled={!enabled}
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${accessibilityLabel}`}
        accessibilityState={{ disabled: !enabled }}
        style={({ pressed }) => [styles.half, pressed && { backgroundColor: c.fillStrong }, !enabled && { opacity: 0.3 }]}>
        <Icon name={icon} size={14} weight="semibold" color={c.text} />
      </Pressable>
    );
  };
  return (
    <View style={styles.row}>
      <Text tabular color="secondary" style={styles.value}>
        {format(value)}
      </Text>
      <View style={[styles.pill, { backgroundColor: c.fill }]}>
        {button('minus', i - 1, 'Less')}
        <View style={[styles.divider, { backgroundColor: c.separator }]} />
        {button('plus', i + 1, 'More')}
      </View>
    </View>
  );
}

function nearestIndex<T>(options: readonly T[], value: T): number {
  const at = options.indexOf(value);
  if (at >= 0 || typeof value !== 'number') return Math.max(0, at);
  let best = 0;
  options.forEach((o, k) => {
    if (typeof o === 'number' && Math.abs(o - value) < Math.abs((options[best] as number) - value)) best = k;
  });
  return best;
}

/** 0%, 0.5%, … up to `max`, as fractions. */
export function percentSteps(max: number, step = 0.005): number[] {
  return Array.from({ length: Math.round(max / step) + 1 }, (_, k) => Math.round(k * step * 10000) / 10000);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  value: {
    minWidth: 44,
    textAlign: 'right',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    borderRadius: 8,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  half: {
    width: 46,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
  },
});
