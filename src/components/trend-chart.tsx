import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useColors } from '@/theme';

import { Text } from './text';

export interface TrendSeries {
  /** One value per slot; null leaves a gap. */
  values: (number | null)[];
  color: string;
  /** Dotted, for a projection. */
  dashed?: boolean;
  /** A dot on the last value, like Health's "today" marker. */
  endDot?: boolean;
}

export interface TrendLabel {
  index: number;
  text: string;
}

const PAD_Y = 8;
/** Room for the end dots. */
const PAD_X = 5;
const LABEL_BOX = 56;

/**
 * Lines over evenly spaced slots (months), drawn the way Health draws its
 * trends: thin lines, one dotted reference line, labels along the bottom, no
 * boxed legend. `zero` adds the dotted line at zero when the values cross it.
 */
export function TrendChart({
  count,
  series,
  labels = [],
  height = 120,
  zero,
  marker,
}: {
  count: number;
  series: TrendSeries[];
  labels?: TrendLabel[];
  height?: number;
  zero?: boolean;
  /** A ringed dot, e.g. a milestone. */
  marker?: { index: number; value: number; color: string } | null;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (marker) all.push(marker.value);
  if (zero) all.push(0);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (!all.length) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const inner = height - PAD_Y * 2;
  const x = (i: number) => (count <= 1 ? width / 2 : PAD_X + (i / (count - 1)) * (width - PAD_X * 2));
  const y = (v: number) => PAD_Y + inner - ((v - min) / (max - min)) * inner;

  const pathOf = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
      pen = true;
    });
    return d;
  };

  return (
    <View onLayout={onLayout}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {zero && min < 0 && max > 0 ? (
              <Line
                x1={0}
                x2={width}
                y1={y(0)}
                y2={y(0)}
                stroke={c.chartGrid}
                strokeWidth={1.5}
                strokeDasharray="1.5,4"
                strokeLinecap="round"
              />
            ) : null}
            {series.map((s, k) => (
              <Path
                key={k}
                d={pathOf(s.values)}
                stroke={s.color}
                strokeWidth={s.dashed ? 2 : 2.2}
                strokeDasharray={s.dashed ? '2,5' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {series.map((s, k) => {
              if (!s.endDot) return null;
              const i = s.values.reduce<number>((last, v, j) => (v != null ? j : last), -1);
              if (i < 0) return null;
              return (
                <Circle key={`dot${k}`} cx={x(i)} cy={y(s.values[i]!)} r={4} fill={s.color} stroke={c.card} strokeWidth={1.5} />
              );
            })}
            {marker ? (
              <>
                <Circle cx={x(marker.index)} cy={y(marker.value)} r={6} fill={c.card} stroke={marker.color} strokeWidth={2} />
                <Circle cx={x(marker.index)} cy={y(marker.value)} r={2} fill={marker.color} />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
      {labels.length ? (
        <View style={styles.axis} pointerEvents="none">
          {width > 0
            ? labels.map((l, i) => {
                // Keep the end labels inside the chart.
                const left = Math.min(Math.max(x(l.index) - LABEL_BOX / 2, 0), width - LABEL_BOX);
                const align = left === 0 ? 'left' : left === width - LABEL_BOX ? 'right' : 'center';
                return (
                  <Text
                    key={`${l.index}-${i}`}
                    variant="caption"
                    color="secondary"
                    align={align}
                    numberOfLines={1}
                    style={[styles.label, { left }]}>
                    {l.text}
                  </Text>
                );
              })
            : null}
        </View>
      ) : null}
    </View>
  );
}

/** What each line is, as small colored text with a short line beside it. */
export function TrendKey({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <View style={styles.key}>
      {items.map((it) => (
        <View key={it.label} style={styles.keyItem}>
          <Svg width={14} height={4}>
            <Line
              x1={1.5}
              x2={12.5}
              y1={2}
              y2={2}
              stroke={it.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={it.dashed ? '1,4' : undefined}
            />
          </Svg>
          <Text variant="footnote" color="secondary">
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: {
    height: 13,
    marginTop: 6,
  },
  label: {
    position: 'absolute',
    top: 0,
    width: LABEL_BOX,
  },
  key: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
  keyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
