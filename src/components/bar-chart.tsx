import { useId, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

import { gridlines } from '@/lib/axis';
import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Text } from './text';

export interface Bar {
  /** The solid part, e.g. what was spent. */
  value: number;
  /**
   * A lighter bar the solid part sits in, e.g. what was earned: the light part
   * on top is what's left. When the value goes past it, the excess shows in red.
   */
  total?: number;
  label: string;
  accessibilityLabel?: string;
  /** Drawn light, to set the bar apart from the ones that matter. */
  faded?: boolean;
}

interface Props {
  bars: Bar[];
  height?: number;
  selected?: number | null;
  /** Leave out for a chart that only shows. */
  onSelect?: (index: number | null) => void;
  /** Labels for the gridlines on the right. Leave out to hide them (e.g. when amounts are hidden). */
  formatTick?: (value: number) => string;
  /** Draws a dashed line at this value, marked "avg", like Screen Time. */
  average?: number | null;
  /** The bars' color. Defaults to the chart blue. */
  color?: string;
  /**
   * For more bars than fit a label each (two years of months): only these
   * labels, each centered under its bar, in place of one per bar.
   */
  axisLabels?: { index: number; text: string }[];
  /** A dashed upright line just before this bar, labeled at the top, e.g. where spending started to climb. */
  marker?: { index: number; label: string } | null;
}

/** Room on the right for the gridline labels. */
const AXIS = 40;
/** Space above the top gridline so its label isn't cut off. */
const TOP = 8;
const RADIUS = 4;
const LABEL_BOX = 48;

/**
 * A year of months as bars, drawn like the charts in Health and Settings › Battery:
 * one color, rounded at the top and square on the baseline, with light gridlines
 * labeled on the right. Tap a bar to select it.
 */
export function BarChart({
  bars,
  height = 150,
  selected = null,
  onSelect,
  formatTick,
  average,
  color,
  axisLabels,
  marker,
}: Props) {
  const c = useColors();
  const fill = color ?? c.bar;
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const clipId = `bars${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const tops = bars.map((b) => Math.max(0, b.value, b.total ?? 0));
  const ticks = gridlines(Math.max(...tops, average ?? 0, 0));
  const ceiling = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - AXIS);
  const plotH = height - TOP;
  const y = (v: number) => TOP + plotH - (v / ceiling) * plotH;
  const slot = plotW / bars.length;
  // Thin bars keep a gap between them even when years of months share the width.
  const barW = Math.min(18, Math.max(slot * 0.58, Math.min(4, slot * 0.75)));
  const avgY = average != null && average > 0 ? y(average) : null;
  // A gridline label that would sit on top of "avg" makes way for it.
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
                stroke={c.chartGrid}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            <Defs>
              {bars.map((_, i) => {
                const h = tops[i] > 0 ? Math.max(2, TOP + plotH - y(tops[i])) : 0;
                const x = i * slot + (slot - barW) / 2;
                return (
                  <ClipPath key={i} id={`${clipId}-${i}`}>
                    <Path d={roundedTop(x, barW, TOP + plotH, h)} />
                  </ClipPath>
                );
              })}
            </Defs>
            {bars.map((b, i) => {
              if (tops[i] <= 0) return null;
              const x = i * slot;
              const base = TOP + plotH;
              const value = Math.max(0, b.value);
              const total = Math.max(0, b.total ?? 0);
              // Each bar is clipped to its rounded outline, so the parts are plain rectangles.
              return (
                <G key={i} clipPath={`url(#${clipId}-${i})`} opacity={selected != null && selected !== i ? 0.3 : b.faded ? 0.35 : 1}>
                  {total === 0 ? (
                    <Rect x={x} y={0} width={slot} height={base} fill={fill} />
                  ) : (
                    <>
                      <Rect x={x} y={0} width={slot} height={base} fill={c.barMuted} />
                      {value > 0 ? (
                        <Rect x={x} y={y(Math.min(value, total))} width={slot} height={base} fill={fill} />
                      ) : null}
                      {value > total ? <Rect x={x} y={0} width={slot} height={y(total)} fill={c.down} /> : null}
                    </>
                  )}
                </G>
              );
            })}
            {marker ? (
              <Line
                x1={marker.index * slot}
                x2={marker.index * slot}
                y1={2}
                y2={TOP + plotH}
                stroke={c.secondary}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}
            {avgY != null ? (
              <Line x1={0} x2={plotW} y1={avgY} y2={avgY} stroke={c.secondary} strokeWidth={1} strokeDasharray="4 3" />
            ) : null}
          </Svg>
        ) : null}
        {marker && width > 0 ? (
          <Text
            variant="caption"
            weight="600"
            color="secondary"
            numberOfLines={1}
            style={[styles.marker, marker.index * slot > plotW * 0.6 ? { right: AXIS + plotW - marker.index * slot + 4 } : { left: marker.index * slot + 4 }]}>
            {marker.label}
          </Text>
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
        <View style={[styles.hitRow, { width: plotW }]}>
          {bars.map((b, i) =>
            onSelect ? (
              <Pressable
                key={i}
                style={styles.hit}
                accessibilityRole="button"
                accessibilityLabel={b.accessibilityLabel ?? b.label}
                accessibilityState={{ selected: selected === i }}
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
      {axisLabels ? (
        <View style={[styles.axisRow, { marginRight: AXIS }]}>
          {width > 0
            ? axisLabels.map((l) => {
                const center = l.index * slot + slot / 2;
                const left = Math.min(Math.max(center - LABEL_BOX / 2, 0), plotW - LABEL_BOX);
                const align = left === 0 ? 'left' : left === plotW - LABEL_BOX ? 'right' : 'center';
                return (
                  <Text
                    key={l.index}
                    variant="caption"
                    weight={selected === l.index ? '700' : '500'}
                    color={selected === l.index ? 'text' : 'secondary'}
                    align={align}
                    numberOfLines={1}
                    style={[styles.axisLabel, { left }]}>
                    {l.text}
                  </Text>
                );
              })
            : null}
        </View>
      ) : (
        <View style={[styles.labels, { marginRight: AXIS }]}>
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
      )}
    </View>
  );
}

/** A bar standing on `base`, `h` tall, rounded at the top only. */
function roundedTop(x: number, w: number, base: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  const top = base - h;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x)},${f(base)}V${f(top + r)}A${r},${r} 0 0 1 ${f(x + r)},${f(top)}H${f(x + w - r)}A${r},${r} 0 0 1 ${f(x + w)},${f(top + r)}V${f(base)}Z`;
}

const styles = StyleSheet.create({
  hitRow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  hit: {
    flex: 1,
  },
  marker: {
    position: 'absolute',
    top: -4,
  },
  tick: {
    position: 'absolute',
    width: AXIS - 6,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  axisRow: {
    height: 14,
    marginTop: 6,
  },
  axisLabel: {
    position: 'absolute',
    top: 0,
    width: LABEL_BOX,
  },
  label: {
    flex: 1,
  },
});
