import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { useScrollLock } from './screen';
import { Text } from './text';

export interface TrendSeries {
  /** One value per slot; null leaves a gap. */
  values: (number | null)[];
  color: string;
  /** Dotted, for a projection. */
  dashed?: boolean;
  /** A dot on the last value, like Health's "today" marker. */
  endDot?: boolean;
  /** A value printed by the line at one slot, e.g. each year's total where the years are compared. */
  tag?: { index: number; text: string };
}

export interface TrendLabel {
  index: number;
  text: string;
  /** Tints the label, e.g. to match a marker above it. */
  color?: string;
}

const PAD_Y = 8;
/** Room for the end dots. */
const PAD_X = 5;
const LABEL_BOX = 56;
const TAG_BOX = 96;
const TAG_HEIGHT = 16;
/** About one digit of the tag's type, to know how wide a tag is. */
const TAG_CHAR = 7.4;
/** Clear of the line and of an end dot. */
const TAG_GAP = 8;
/** A drag this far sideways, or a hold this long, makes the chart keep the finger (as in LineChart). */
const SIDEWAYS = 5;
const HOLD_MS = 250;
/** Moving this far up or down first means the page should scroll instead. */
const UPDOWN = 8;

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
  onScrub,
}: {
  count: number;
  series: TrendSeries[];
  labels?: TrendLabel[];
  height?: number;
  zero?: boolean;
  /** A ringed dot, e.g. a milestone. */
  marker?: { index: number; value: number; color: string } | null;
  /** Drag across to read values: called with the slot under the finger, or null when released. */
  onScrub?: (index: number | null) => void;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const touch = useScrub(count, width, (i) => {
    setActive(i);
    onScrub?.(i);
  });

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
  // Room above and below the lines for their tags.
  const room = series.some((s) => s.tag) ? TAG_HEIGHT + TAG_GAP : 0;
  const inner = height - PAD_Y * 2 - room * 2;
  const x = (i: number) => (count <= 1 ? width / 2 : PAD_X + (i / (count - 1)) * (width - PAD_X * 2));
  const y = (v: number) => PAD_Y + room + inner - ((v - min) / (max - min)) * inner;

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
    <View onLayout={onLayout} {...(onScrub ? touch : null)}>
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
                // Keyed by look as well as place: react-native-svg on iOS keeps an old dash
                // pattern when a reused Path's strokeDasharray goes back to undefined, so a
                // solid line that takes over a dotted one's slot would stay dotted.
                key={`${k}-${s.dashed ? 'dotted' : 'solid'}-${s.color}`}
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
            {active != null ? (
              <>
                <Line x1={x(active)} x2={x(active)} y1={0} y2={height} stroke={c.secondary} strokeWidth={1} />
                {series.map((s, k) => {
                  const v = s.values[active];
                  return v == null ? null : (
                    <Circle key={`at${k}`} cx={x(active)} cy={y(v)} r={4} fill={s.color} stroke={c.card} strokeWidth={1.5} />
                  );
                })}
              </>
            ) : null}
            {marker && active == null ? (
              <>
                <Circle cx={x(marker.index)} cy={y(marker.value)} r={6} fill={c.card} stroke={marker.color} strokeWidth={2} />
                <Circle cx={x(marker.index)} cy={y(marker.value)} r={2} fill={marker.color} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {width > 0 && active == null
          ? placeTags(series, x, y, width, height).map((t) => (
              <Text
                key={t.key}
                variant="caption"
                weight="600"
                tabular
                color={t.color}
                align={t.align}
                numberOfLines={1}
                style={[styles.tag, { left: t.left, top: t.top, width: t.width }]}>
                {t.text}
              </Text>
            ))
          : null}
      </View>
      {labels.length ? (
        <View style={styles.axis} pointerEvents="none">
          {width > 0
            ? placeLabels(labels, x, width).map(({ label: l, left }, i) => {
                const align = left === 0 ? 'left' : left === width - LABEL_BOX ? 'right' : 'center';
                return (
                  <Text
                    key={`${l.index}-${i}`}
                    variant="caption"
                    color={l.color ?? 'secondary'}
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

/** The height of a series' line at a horizontal position, between its points. Null where it has no line. */
function lineY(values: (number | null)[], px: number, x: (i: number) => number, y: (v: number) => number): number | null {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (Math.abs(x(i) - px) < 0.5) return y(v);
    const next = values[i + 1];
    if (next == null || px < x(i) || px > x(i + 1)) continue;
    const t = (px - x(i)) / (x(i + 1) - x(i));
    return y(v) + (y(next) - y(v)) * t;
  }
  return null;
}

/**
 * Where each line's tag goes, so it never sits on a line or a dot. The upper
 * line's tag ends at its point and goes above every line that passes under
 * its width; the lower line's starts at its point and goes below every line
 * over its width. Both stay inside the chart.
 */
function placeTags(
  series: TrendSeries[],
  x: (i: number) => number,
  y: (v: number) => number,
  width: number,
  height: number,
) {
  const tags = series
    .flatMap((s, k) => {
      const v = s.tag ? s.values[s.tag.index] : null;
      return s.tag && v != null ? [{ key: `tag${k}`, text: s.tag.text, color: s.color, px: x(s.tag.index), py: y(v) }] : [];
    })
    .sort((a, b) => a.py - b.py);
  return tags.map((t, i) => {
    const above = i === 0;
    const w = Math.min(TAG_BOX, Math.ceil(t.text.length * TAG_CHAR) + 4);
    const left = Math.min(Math.max(above ? t.px + 4 - w : t.px - 4, 0), width - w);
    // Every line's height across the tag: at its two ends and at each point in between.
    const at = [left, left + w, ...series[0].values.map((_, j) => x(j)).filter((px) => px > left && px < left + w)];
    const ys = series.flatMap((s) => at.map((px) => lineY(s.values, px, x, y))).filter((v): v is number => v != null);
    const top = above ? Math.min(t.py, ...ys) - TAG_HEIGHT - TAG_GAP : Math.max(t.py, ...ys) + TAG_GAP;
    return {
      ...t,
      left,
      width: w,
      top: Math.min(Math.max(top, 0), height - TAG_HEIGHT),
      align: (above ? 'right' : 'left') as 'left' | 'right',
    };
  });
}

/**
 * Where each label goes, kept inside the chart. Labels that would overlap are
 * dropped, later ones first in line, so "Today" wins over a start date that's
 * right beside it.
 */
function placeLabels(labels: TrendLabel[], x: (i: number) => number, width: number) {
  const placed: { label: TrendLabel; left: number }[] = [];
  for (const label of [...labels].reverse()) {
    const left = Math.min(Math.max(x(label.index) - LABEL_BOX / 2, 0), width - LABEL_BOX);
    // Single letters (months) sit close together; longer labels need their whole box.
    const room = label.text.length <= 2 ? 0 : LABEL_BOX;
    if (placed.some((p) => Math.abs(p.left - left) < Math.max(room, p.label.text.length <= 2 ? 0 : LABEL_BOX))) continue;
    placed.push({ label, left });
  }
  return placed.reverse();
}

/** Finger tracking for `TrendChart`, with the same feel as `LineChart`: sideways drags keep the page still. */
function useScrub(count: number, width: number, onChange: (index: number | null) => void) {
  const lockScroll = useScrollLock();
  const last = useRef<number | null>(null);
  const drag = useRef({ x: 0, y: 0, locked: false, timer: null as ReturnType<typeof setTimeout> | null });
  const stopTimer = () => {
    if (drag.current.timer) clearTimeout(drag.current.timer);
    drag.current.timer = null;
  };
  const lock = () => {
    stopTimer();
    if (drag.current.locked) return;
    drag.current.locked = true;
    lockScroll(true);
  };
  const unlock = () => {
    stopTimer();
    if (!drag.current.locked) return;
    drag.current.locked = false;
    lockScroll(false);
  };
  useEffect(() => unlock, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (e: GestureResponderEvent) => {
    if (width <= 0 || count < 1) return;
    const ratio = (e.nativeEvent.locationX - PAD_X) / Math.max(width - PAD_X * 2, 1);
    const i = Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
    if (i === last.current) return;
    if (last.current != null) haptics.selection();
    last.current = i;
    onChange(i);
  };
  const end = () => {
    unlock();
    last.current = null;
    onChange(null);
  };
  return {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => !drag.current.locked,
    onResponderGrant: (e: GestureResponderEvent) => {
      drag.current.x = e.nativeEvent.pageX;
      drag.current.y = e.nativeEvent.pageY;
      stopTimer();
      drag.current.timer = setTimeout(lock, HOLD_MS);
      update(e);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (!drag.current.locked) {
        const dx = Math.abs(e.nativeEvent.pageX - drag.current.x);
        const dy = Math.abs(e.nativeEvent.pageY - drag.current.y);
        if (dx > SIDEWAYS && dx >= dy) lock();
        else if (dy > UPDOWN) stopTimer();
      }
      update(e);
    },
    onResponderRelease: end,
    onResponderTerminate: end,
  };
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
  tag: {
    position: 'absolute',
    pointerEvents: 'none',
  },
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
