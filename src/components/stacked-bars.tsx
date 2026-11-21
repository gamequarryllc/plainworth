import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
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
 * Columns that fit across before the chart scrolls sideways. The half column
 * peeking in at the left edge is the hint that there's more to swipe back to.
 */
const FIT = 6;
const ACROSS = FIT + 0.5;

/**
 * Stacked columns, one per period, like the Health app's stacked activity
 * bars: the biggest category at the bottom, a hairline gap between pieces,
 * rounded tops. Tap a column to pick it; the others dim. With `below`, each
 * column also gets one piece under the line (debts), so the line is zero.
 * More than six columns scroll sideways, opening on the newest at the right.
 */
export function StackedBars({
  values,
  colors,
  labels,
  selected,
  onSelect,
  below,
  belowColor,
  height = 150,
}: {
  /** values[column][piece], bottom piece first. */
  values: number[][];
  colors: string[];
  labels: string[];
  selected: number;
  onSelect?: (index: number) => void;
  /** below[column]: one amount drawn under the line, as a positive number. */
  below?: number[];
  belowColor?: string;
  height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const up = Math.max(0, ...values.map((col) => col.reduce((s, v) => s + Math.max(v, 0), 0)));
  const down = Math.max(0, ...(below ?? []));
  const max = Math.max(1, up + down);
  // Where zero sits: the bottom, unless something hangs below it.
  const zero = down > 0 ? (up / max) * height : height;
  const n = values.length;
  const scrolls = n > FIT;
  const slot = n ? width / (scrolls ? ACROSS : n) : 0;
  const barW = Math.min(36, slot * 0.56);
  const full = slot * n;
  const scroller = useRef<ScrollViewInstance>(null);

  const chart = (
    <View style={{ width: full }}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={full} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {values.map((col, i) => {
              const x = i * slot + (slot - barW) / 2;
              let top = zero;
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
            {below?.map((v, i) => {
              if (!(v > 0)) return null;
              const x = i * slot + (slot - barW) / 2;
              const y = zero + GAP;
              const h = Math.max((v / max) * height - GAP, 0.5);
              const opacity = i === selected ? 1 : 0.35;
              const fill = belowColor ?? c.down;
              if (h > RADIUS) {
                const r = RADIUS;
                const d = `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + barW - r}Q${x + barW},${y + h} ${x + barW},${y + h - r}V${y}Z`;
                return <Path key={`below-${i}`} d={d} fill={fill} opacity={opacity} />;
              }
              return <Rect key={`below-${i}`} x={x} y={y} width={barW} height={h} fill={fill} opacity={opacity} />;
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
      <View style={[styles.base, { top: zero, backgroundColor: c.chartGrid }]} />
    </View>
  );

  return (
    <View onLayout={onLayout}>
      {width === 0 ? null : scrolls ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Open on the newest columns, and again when the columns change (Monthly to Yearly).
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
          {chart}
        </ScrollView>
      ) : (
        chart
      )}
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
