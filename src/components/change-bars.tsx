import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Text } from './text';

export interface ChangeBar {
  /** Above zero grows up in green, below zero down in red. Null draws nothing. */
  value: number | null;
  label: string;
  accessibilityLabel?: string;
}

interface Props {
  bars: ChangeBar[];
  height?: number;
  selected?: number | null;
  /** Leave out for a chart that only shows. */
  onSelect?: (index: number | null) => void;
}

const PAD = 4;
/** Rounding on the end away from the zero line. The end on the line stays square. */
const RADIUS = 4;

/** Gains and losses side by side, e.g. a year of months, growing from a zero line. Tap a bar to select it. */
export function ChangeBars({ bars, height = 110, selected = null, onSelect }: Props) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  let up = 0;
  let down = 0;
  for (const b of bars) {
    if (b.value == null) continue;
    up = Math.max(up, b.value);
    down = Math.max(down, -b.value);
  }
  const inner = height - PAD * 2;
  // All gains: the line sits at the bottom. All losses: at the top.
  const zero = up + down > 0 ? PAD + (up / (up + down)) * inner : height - PAD;
  const scale = up + down > 0 ? inner / (up + down) : 0;
  const slot = width / bars.length;
  const barW = Math.max(4, Math.min(22, slot * 0.56));

  return (
    <View>
      <View style={{ height }} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line x1={0} x2={width} y1={zero} y2={zero} stroke={c.chartGrid} strokeWidth={1} />
            {bars.map((b, i) => {
              if (b.value == null || b.value === 0) return null;
              // A small change still gets a sliver, so it doesn't vanish next to a big one.
              const h = Math.max(2, Math.abs(b.value) * scale);
              const x = i * slot + (slot - barW) / 2;
              return (
                <Path
                  key={i}
                  d={barPath(x, barW, zero, b.value > 0 ? -h : h)}
                  fill={b.value > 0 ? c.up : c.down}
                  opacity={selected != null && selected !== i ? 0.3 : 1}
                />
              );
            })}
          </Svg>
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.hitRow]}>
          {bars.map((b, i) =>
            onSelect ? (
              <Pressable
                key={i}
                style={styles.hit}
                disabled={b.value == null}
                accessibilityRole="button"
                accessibilityLabel={b.accessibilityLabel ?? b.label}
                accessibilityState={{ selected: selected === i, disabled: b.value == null }}
                onPress={() => {
                  haptics.selection();
                  onSelect(selected === i ? null : i);
                }}
              />
            ) : (
              <View key={i} style={styles.hit} accessible accessibilityLabel={b.accessibilityLabel ?? b.label} />
            ),
          )}
        </View>
      </View>
      <View style={styles.labels}>
        {bars.map((b, i) => (
          <Text
            key={i}
            variant="caption"
            weight={selected === i ? '700' : '500'}
            color={selected === i ? 'text' : 'secondary'}
            align="center"
            style={styles.label}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** A bar from the zero line at `y0`, `dy` up (negative) or down (positive), rounded at its far end. */
function barPath(x: number, w: number, y0: number, dy: number): string {
  const r = Math.min(RADIUS, w / 2, Math.abs(dy));
  const end = y0 + dy;
  const f = (n: number) => n.toFixed(2);
  if (dy < 0) {
    return `M${f(x)},${f(y0)}V${f(end + r)}A${r},${r} 0 0 1 ${f(x + r)},${f(end)}H${f(x + w - r)}A${r},${r} 0 0 1 ${f(x + w)},${f(end + r)}V${f(y0)}Z`;
  }
  return `M${f(x)},${f(y0)}V${f(end - r)}A${r},${r} 0 0 0 ${f(x + r)},${f(end)}H${f(x + w - r)}A${r},${r} 0 0 0 ${f(x + w)},${f(end - r)}V${f(y0)}Z`;
}

const styles = StyleSheet.create({
  hitRow: {
    flexDirection: 'row',
  },
  hit: {
    flex: 1,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  label: {
    flex: 1,
  },
});
