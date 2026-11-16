import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { gridlines } from '@/lib/axis';
import { useColors } from '@/theme';

import { barOpacity, useBarScrub } from './bar-chart';
import { Text } from './text';

export interface GainBar {
  /** How much it rose (or fell, below zero). Null draws no bar. */
  value: number | null;
  label: string;
  accessibilityLabel?: string;
  /** Drawn light, e.g. the year still going. */
  faded?: boolean;
}

interface Props {
  bars: GainBar[];
  height?: number;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  /** Labels for the gridlines on the right. Leave out to hide them. */
  formatTick?: (value: number) => string;
  /** A dashed line at this value, marked "avg". */
  average?: number | null;
}

const AXIS = 44;
const TOP = 8;
const BOTTOM = 2;
const RADIUS = 4;

/**
 * Rises and falls as bars around a zero line, like the Stocks app's
 * earnings bars: green above, red below, rounded at the outer end. Tap or
 * drag to look, the same way as `BarChart`.
 */
export function GainBars({ bars, height = 150, selected = null, onSelect, formatTick, average }: Props) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const plotW = Math.max(0, width - AXIS);
  const touch = useBarScrub(bars.length, plotW, selected, onSelect);

  const values = bars.map((b) => b.value ?? 0);
  const max = Math.max(0, ...values, average ?? 0);
  const min = Math.min(0, ...values, average ?? 0);
  // One even step on both sides of zero, so a fall reads against the same scale as a rise.
  const up = gridlines(Math.max(max, -min));
  const step = up[1] - up[0];
  const ticksUp = max > 0 ? up.filter((t, i) => i === 0 || up[i - 1] < max) : [0];
  const downCount = min < 0 ? Math.ceil(-min / step) : 0;
  const ticks = [...Array.from({ length: downCount }, (_, i) => -(downCount - i) * step), ...ticksUp];
  const top = ticks[ticks.length - 1];
  const bottom = ticks[0];
  const span = top - bottom || 1;
  const plotH = height - TOP - BOTTOM;
  const y = (v: number) => TOP + ((top - v) / span) * plotH;
  const zero = y(0);
  const slot = bars.length ? plotW / bars.length : 0;
  const barW = Math.min(18, Math.max(slot * 0.58, Math.min(4, slot * 0.75)));
  const avgY = average != null && average !== 0 ? y(average) : null;
  const shownTicks = ticks.filter((t) => avgY == null || Math.abs(y(t) - avgY) > 13);

  return (
    <View>
      <View style={{ height }} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {ticks.map((t) => (
              <Line
                key={t}
                x1={0}
                x2={plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? c.secondary : c.chartGrid}
                strokeWidth={t === 0 ? 1 : StyleSheet.hairlineWidth}
                opacity={t === 0 ? 0.5 : 1}
              />
            ))}
            {bars.map((b, i) => {
              if (b.value == null || b.value === 0) return null;
              const x = i * slot + (slot - barW) / 2;
              const h = Math.max(2, Math.abs(y(b.value) - zero));
              return (
                <Path
                  key={i}
                  d={b.value > 0 ? roundedUp(x, barW, zero, h) : roundedDown(x, barW, zero, h)}
                  fill={b.value > 0 ? c.up : c.down}
                  opacity={barOpacity(i, selected, b.faded)}
                />
              );
            })}
            {avgY != null ? (
              <Line x1={0} x2={plotW} y1={avgY} y2={avgY} stroke={c.secondary} strokeWidth={1} strokeDasharray="4 3" />
            ) : null}
          </Svg>
        ) : null}
        {avgY != null && width > 0 ? (
          <Text variant="caption" weight="600" color="secondary" style={[styles.tick, { top: avgY - 7, left: plotW + 6 }]}>
            avg
          </Text>
        ) : null}
        {formatTick && width > 0
          ? shownTicks.map((t) => (
              <Text
                key={t}
                variant="caption"
                color="secondary"
                tabular
                numberOfLines={1}
                style={[styles.tick, { top: y(t) - 7, left: plotW + 6 }]}>
                {formatTick(t)}
              </Text>
            ))
          : null}
        <View style={[styles.hitRow, { width: plotW }]} {...(onSelect ? touch : null)}>
          {bars.map((b, i) =>
            onSelect ? (
              <View
                key={i}
                style={styles.hit}
                pointerEvents="none"
                accessible
                accessibilityRole="button"
                accessibilityLabel={b.accessibilityLabel ?? b.label}
                accessibilityState={{ selected: selected === i }}
                onAccessibilityTap={() => onSelect(selected === i ? null : i)}
              />
            ) : (
              <View key={i} style={styles.hit} accessible accessibilityLabel={b.accessibilityLabel ?? b.label} />
            ),
          )}
        </View>
      </View>
      <View style={[styles.labels, { marginRight: AXIS }]}>
        {bars.map((b, i) => (
          <Text
            key={i}
            variant="caption"
            weight={selected === i ? '700' : '500'}
            color={selected === i ? 'text' : 'secondary'}
            align="center"
            numberOfLines={1}
            style={styles.label}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const f = (n: number) => n.toFixed(2);

function roundedUp(x: number, w: number, base: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  const t = base - h;
  return `M${f(x)},${f(base)}V${f(t + r)}A${r},${r} 0 0 1 ${f(x + r)},${f(t)}H${f(x + w - r)}A${r},${r} 0 0 1 ${f(x + w)},${f(t + r)}V${f(base)}Z`;
}

function roundedDown(x: number, w: number, base: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  const b = base + h;
  return `M${f(x)},${f(base)}V${f(b - r)}A${r},${r} 0 0 0 ${f(x + r)},${f(b)}H${f(x + w - r)}A${r},${r} 0 0 0 ${f(x + w)},${f(b - r)}V${f(base)}Z`;
}

const styles = StyleSheet.create({
  hitRow: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  hit: { flex: 1 },
  tick: { position: 'absolute', width: AXIS - 6 },
  labels: { flexDirection: 'row', marginTop: 6 },
  label: { flex: 1 },
});
