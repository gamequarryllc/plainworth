import { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { timeAxis, valueTicks } from '@/lib/axis';
import { haptics } from '@/lib/haptics';
import type { SeriesPoint } from '@/lib/networth';
import { layout, useColors } from '@/theme';

import { useScrollLock } from './screen';
import { Text } from './text';

interface Props {
  points: SeriesPoint[];
  color: string;
  height?: number;
  /** Dotted reference line (the value at the start of the range). */
  baseline?: number | null;
  /** Called with the index under the finger, or null when released. */
  onScrub?: (index: number | null) => void;
  /** Month (or date, or year) names along the bottom. */
  axis?: boolean;
  /** Faint dashed gridlines, labeled on the left with this (leave out to show them unlabeled, e.g. when amounts are hidden). */
  grid?: boolean;
  formatTick?: (value: number) => string;
}

const PAD_Y = 10;
/** Rough width of one character of a gridline label at the caption size, to size the room for them. */
const TICK_CHAR = 6.6;
/** Width of the box each axis label is centered in. */
const LABEL_BOX = 44;
/** A drag this far sideways, or a hold this long, makes the chart keep the finger. */
const SIDEWAYS = 5;
const HOLD_MS = 250;
/** Moving this far up or down first means the page should scroll instead. */
const UPDOWN = 8;

/** A minimal line chart in the style of Stocks: no axes, drag to read values. */
export function LineChart({ points, color, height = 160, baseline, onScrub, axis, grid, formatTick }: Props) {
  const c = useColors();
  const gradientId = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const last = useRef<number | null>(null);
  const lockScroll = useScrollLock();
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

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    min = Math.min(min, p.value);
    max = Math.max(max, p.value);
  }
  if (baseline != null) {
    min = Math.min(min, baseline);
    max = Math.max(max, baseline);
  }
  const ticks = grid && points.length > 0 ? valueTicks(min, max) : [];
  if (ticks.length) {
    min = ticks[0];
    max = ticks[ticks.length - 1];
  }
  const tickLabels = formatTick ? ticks.map(formatTick) : [];
  // Room on the left for the labels, which line up with the page's text.
  const gutter = tickLabels.length
    ? layout.margin + Math.max(...tickLabels.map((t) => t.length)) * TICK_CHAR + 6
    : 0;
  const plotW = Math.max(0, width - gutter);

  let xs: number[] = [];
  let ys: number[] = [];
  let baseY: number | null = null;
  let y = (_v: number) => height / 2;
  if (width > 0 && points.length > 0) {
    const minDay = points[0].day;
    const maxDay = points[points.length - 1].day;
    const spanX = maxDay - minDay || 1;
    const spanY = max - min;
    const innerH = height - PAD_Y * 2;
    y = (v: number) => (spanY === 0 ? height / 2 : PAD_Y + innerH - ((v - min) / spanY) * innerH);
    const x = (day: number) => gutter + ((day - minDay) / spanX) * plotW;
    xs = points.map((p) => x(p.day));
    ys = points.map((p) => y(p.value));
    baseY = baseline != null ? y(baseline) : null;
  }

  const body = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${ys[i].toFixed(2)}`).join('');
  const line = body;
  const left = xs[0];
  const area = xs.length ? `${line}L${xs[xs.length - 1].toFixed(2)},${height}L${(left ?? 0).toFixed(2)},${height}Z` : '';

  const indexAt = (x: number) => {
    if (!xs.length) return null;
    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    }
    return best;
  };
  const update = (e: GestureResponderEvent) => {
    const i = indexAt(e.nativeEvent.locationX);
    if (i === last.current) return;
    if (last.current != null) haptics.selection();
    last.current = i;
    setActive(i);
    onScrub?.(i);
  };
  const grant = (e: GestureResponderEvent) => {
    drag.current.x = e.nativeEvent.pageX;
    drag.current.y = e.nativeEvent.pageY;
    stopTimer();
    drag.current.timer = setTimeout(lock, HOLD_MS);
    update(e);
  };
  // Once you're dragging along the chart, drifting up or down no longer scrolls the page.
  const move = (e: GestureResponderEvent) => {
    if (!drag.current.locked) {
      const dx = Math.abs(e.nativeEvent.pageX - drag.current.x);
      const dy = Math.abs(e.nativeEvent.pageY - drag.current.y);
      if (dx > SIDEWAYS && dx >= dy) lock();
      else if (dy > UPDOWN) stopTimer();
    }
    update(e);
  };
  const end = () => {
    unlock();
    last.current = null;
    setActive(null);
    onScrub?.(null);
  };
  const touch = onScrub
    ? {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => !drag.current.locked,
        onResponderGrant: grant,
        onResponderMove: move,
        onResponderRelease: end,
        onResponderTerminate: end,
      }
    : null;

  const activeX = active != null ? xs[active] : null;
  const activeY = active != null ? ys[active] : null;
  const activeDay = active != null ? points[active]?.day : undefined;
  const dim = active != null;
  const labels =
    axis && points.length > 1
      ? timeAxis(points[0].day, points[points.length - 1].day, plotW).map((l) => ({ ...l, x: l.x + gutter }))
      : [];

  return (
    <View onLayout={onLayout} {...touch}>
      <View style={{ height }}>
        {width > 0 && xs.length > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {ticks.map((t) => (
              <Line
                key={t}
                x1={gutter}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                stroke={c.chartGrid}
                strokeWidth={1}
                strokeDasharray="3,4"
              />
            ))}
            {baseY != null ? (
              <Line
                x1={gutter}
                x2={width}
                y1={baseY}
                y2={baseY}
                stroke={c.chartGrid}
                strokeWidth={1.5}
                strokeDasharray="1.5,4"
                strokeLinecap="round"
              />
            ) : null}
            <Path d={area} fill={`url(#${gradientId})`} opacity={dim ? 0.6 : 1} />
            <Path
              d={line}
              stroke={color}
              strokeWidth={2.2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {activeX != null && activeY != null ? (
              <>
                <Line x1={activeX} x2={activeX} y1={0} y2={height} stroke={c.secondary} strokeWidth={1} />
                <Circle cx={activeX} cy={activeY} r={7} fill={color} opacity={0.25} />
                <Circle cx={activeX} cy={activeY} r={4} fill={color} stroke={c.background} strokeWidth={1.5} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {width > 0 && tickLabels.length ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {tickLabels.map((text, i) => (
              <Text
                key={`${ticks[i]}`}
                variant="caption"
                color="secondary"
                tabular
                numberOfLines={1}
                style={[styles.tick, { top: y(ticks[i]) - 7 }]}>
                {text}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      {axis ? (
        <View style={styles.axis} pointerEvents="none">
          {labels.map((l) => {
            const here = activeDay != null && activeDay >= l.from && activeDay < l.to;
            return (
              <Text
                key={`${l.from}-${l.text}`}
                variant="caption"
                color={here ? 'text' : 'secondary'}
                weight={here ? '600' : '400'}
                align="center"
                numberOfLines={1}
                style={[styles.label, { left: l.x - LABEL_BOX / 2 }]}>
                {l.text}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: {
    height: 13,
    marginTop: 6,
  },
  tick: {
    position: 'absolute',
    left: layout.margin,
  },
  label: {
    position: 'absolute',
    top: 0,
    width: LABEL_BOX,
  },
});
