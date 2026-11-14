import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from './text';

export interface ChartTipContent {
  /** The date or month, in the tint color. */
  title: string;
  /** One value per line, e.g. "$160,282" or "2025  +$4,100". */
  rows: { label?: string; value: string; color?: string }[];
}

/** Space between the point and the tip. */
const GAP = 10;

/**
 * The small date and value that ride along with the finger while you drag a
 * chart, as in Stocks: centered over the point, above it when there's room
 * and below it otherwise, always inside the chart.
 */
export function ChartTip({
  content,
  x,
  y,
  width,
  height,
  background,
}: {
  content: ChartTipContent;
  /** The point under the finger. */
  x: number;
  y: number;
  /** The chart's size, to keep the tip inside it. */
  width: number;
  height: number;
  /** Behind the text, so lines and gridlines don't run through it. */
  background: string;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (Math.abs(w - size.w) > 0.5 || Math.abs(h - size.h) > 0.5) setSize({ w, h });
  };
  const left = Math.min(Math.max(x - size.w / 2, 0), Math.max(width - size.w, 0));
  const top = y - GAP - size.h >= 0 ? y - GAP - size.h : Math.min(y + GAP, Math.max(height - size.h, 0));
  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[styles.tip, { left, top, backgroundColor: background, opacity: size.w ? 1 : 0 }]}>
      <Text variant="caption" weight="600" color="tint" align="center" numberOfLines={1}>
        {content.title}
      </Text>
      {content.rows.map((r, i) => (
        <Text key={`${i}-${r.label ?? ''}`} variant="footnote" align="center" numberOfLines={1}>
          {r.label ? (
            <Text variant="footnote" color="secondary">
              {`${r.label}  `}
            </Text>
          ) : null}
          <Text variant="footnote" weight="600" tabular color={r.color ?? 'text'}>
            {r.value}
          </Text>
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
