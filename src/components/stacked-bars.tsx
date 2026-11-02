import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Text } from './text';

/**
 * Apple's system colors, in the order Charts hands them out, for one color per
 * category that holds up in light and dark mode.
 */
export function useCategoryColors(): string[] {
  const c = useColors();
  return [c.tint, c.up, c.warning, c.invest, '#30B0C7', '#FFCC00', '#FF2D55', '#5856D6', '#A2845E', '#8E8E93'];
}

const GAP = 1.5;
const RADIUS = 4;

/**
 * Stacked columns, one per period, like the Health app's stacked activity
 * bars: the biggest category at the bottom, a hairline gap between pieces,
 * rounded tops. Tap a column to pick it; the others dim.
 */
export function StackedBars({
  values,
  colors,
  labels,
  selected,
  onSelect,
  height = 150,
}: {
  /** values[column][piece], bottom piece first. */
  values: number[][];
  colors: string[];
  labels: string[];
  selected: number;
  onSelect?: (index: number) => void;
  height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const max = Math.max(1, ...values.map((col) => col.reduce((s, v) => s + Math.max(v, 0), 0)));
  const n = values.length;
  const slot = n ? width / n : 0;
  const barW = Math.min(36, slot * 0.56);

  return (
    <View onLayout={onLayout}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {values.map((col, i) => {
              const x = i * slot + (slot - barW) / 2;
              let top = height;
              const pieces = col.flatMap((v, k) => (v > 0 ? [{ v, k }] : []));
              return pieces.map(({ v, k }, j) => {
                const h = Math.max((v / max) * height - (j > 0 ? GAP : 0), 0.5);
                top -= h + (j > 0 ? GAP : 0);
                const y = top;
                const fill = colors[k % colors.length];
                const opacity = i === selected ? 1 : 0.35;
                // Only the top piece gets the rounded corners.
                if (j === pieces.length - 1 && h > RADIUS) {
                  const r = RADIUS;
                  const d = `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + h}Z`;
                  return <Path key={`${i}-${k}`} d={d} fill={fill} opacity={opacity} />;
                }
                return <Rect key={`${i}-${k}`} x={x} y={y} width={barW} height={h} fill={fill} opacity={opacity} />;
              });
            })}
          </Svg>
        ) : null}
        {onSelect
          ? values.map((_, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={labels[i]}
                accessibilityState={{ selected: i === selected }}
                onPress={() => {
                  if (i !== selected) haptics.selection();
                  onSelect(i);
                }}
                style={[styles.hit, { left: i * slot, width: slot, height }]}
              />
            ))
          : null}
      </View>
      <View style={styles.axis} pointerEvents="none">
        {labels.map((l, i) => (
          <Text
            key={`${l}-${i}`}
            variant="caption"
            align="center"
            numberOfLines={1}
            color={i === selected ? 'text' : 'secondary'}
            weight={i === selected ? '600' : '400'}
            style={[styles.label, { left: i * slot, width: slot }]}>
            {l}
          </Text>
        ))}
      </View>
      <View style={[styles.base, { top: height, backgroundColor: c.chartGrid }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    top: 0,
  },
  axis: {
    height: 13,
    marginTop: 6,
  },
  label: {
    position: 'absolute',
    top: 0,
  },
  base: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
