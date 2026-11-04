import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { timeAxis, valueTicks } from '@/lib/axis';
import { haptics } from '@/lib/haptics';
import { valueAt } from '@/lib/insights';
import type { SeriesPoint } from '@/lib/networth';
import { useColors } from '@/theme';

import { useScrollLock } from './screen';
import { Text } from './text';

export interface ChartLine {
  key: string;
  points: SeriesPoint[];
  color: string;
}

const PAD_Y = 10;
/** Room on the right for the dots at today. */
const PAD_R = 4;
/** Rough width of one character of a gridline label at the caption size. */
const TICK_CHAR = 6.6;
const LABEL_BOX = 44;
/** A drag this far sideways, or a hold this long, makes the chart keep the finger (as in LineChart). */
const SIDEWAYS = 5;
const HOLD_MS = 250;
const UPDOWN = 8;

/**
 * Several lines over the same days, like Stocks comparing symbols: thin
 * lines, no fill, faint dashed gridlines labeled on the left, and a dotted
 * line at zero once anything is below it. Drag across to read every line on
 * one day; `onScrub` gets that day, or null when the finger lifts.
 */
export function MultiLineChart({
  lines,
  from,
  to,
  height = 170,
  formatTick,
  onScrub,
}: {
  lines: ChartLine[];
  /** First and last day shown. */
  from: number;
  to: number;
  height?: number;
  /** Labels for the gridlines; left out (amounts hidden), the lines are drawn unlabeled. */
  formatTick?: (value: number) => string;
  onScrub?: (day: number | null) => void;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  let min = 0;
  let max = 0;
  for (const l of lines) {
    for (const p of l.points) {
      min = Math.min(min, p.value);
      max = Math.max(max, p.value);
    }
  }
  const ticks = valueTicks(min, max);
  min = ticks[0];
  max = ticks[ticks.length - 1];
  const tickLabels = formatTick ? ticks.map(formatTick) : [];
  const gutter = tickLabels.length ? Math.max(...tickLabels.map((t) => t.length)) * TICK_CHAR + 8 : 0;
  const plotW = Math.max(0, width - gutter - PAD_R);
  const span = to - from || 1;
  const innerH = height - PAD_Y * 2;
  const x = (day: number) => gutter + ((Math.min(Math.max(day, from), to) - from) / span) * plotW;
  const y = (v: number) => PAD_Y + innerH - ((v - min) / (max - min || 1)) * innerH;

  // Each line steps flat to today if its last entry is earlier.
  const pathOf = (points: SeriesPoint[]) => {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(2)},${y(p.value).toFixed(2)}`).join('');
    const last = points[points.length - 1];
    return last && last.day < to ? `${d}L${x(to).toFixed(2)},${y(last.value).toFixed(2)}` : d;
  };

  // Days you can stop on while dragging: every day any line changed.
  const days = [...new Set([from, ...lines.flatMap((l) => l.points.map((p) => p.day)), to])].sort((a, b) => a - b);
  const touch = useDayScrub(days, x, (day) => {
    setActive(day);
    onScrub?.(day);
  });

  const axis = width > 0 ? timeAxis(from, to, plotW).map((l) => ({ ...l, x: l.x + gutter })) : [];
  const valueOn = (l: ChartLine, day: number) => valueAt(l.points, day) ?? 0;

  return (
    <View onLayout={onLayout} {...(onScrub ? touch : null)}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {ticks.map((t) =>
              t === 0 && min < 0 ? null : (
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
              ),
            )}
            {min < 0 ? (
              <Line
                x1={gutter}
                x2={width}
                y1={y(0)}
                y2={y(0)}
                stroke={c.secondary}
                strokeOpacity={0.5}
                strokeWidth={1.5}
                strokeDasharray="1.5,4"
                strokeLinecap="round"
              />
            ) : null}
            {lines.map((l) => (
              <Path
                key={l.key}
                d={pathOf(l.points)}
                stroke={l.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={active != null ? 0.85 : 1}
              />
            ))}
            {active != null ? (
              <>
                <Line x1={x(active)} x2={x(active)} y1={0} y2={height} stroke={c.secondary} strokeWidth={1} />
                {lines.map((l) => (
                  <Circle
                    key={`at${l.key}`}
                    cx={x(active)}
                    cy={y(valueOn(l, active))}
                    r={4}
                    fill={l.color}
                    stroke={c.card}
                    strokeWidth={1.5}
                  />
                ))}
              </>
            ) : (
              lines.map((l) => (
                <Circle key={`end${l.key}`} cx={x(to)} cy={y(valueOn(l, to))} r={3} fill={l.color} />
              ))
            )}
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
      <View style={styles.axis} pointerEvents="none">
        {axis.map((l) => {
          const here = active != null && active >= l.from && active < l.to;
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
    </View>
  );
}

/** Finger tracking that snaps to the nearest of `days`, with the same feel as the other charts. */
function useDayScrub(days: number[], x: (day: number) => number, onChange: (day: number | null) => void) {
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
    if (!days.length) return;
    const at = e.nativeEvent.locationX;
    let best = days[0];
    for (const d of days) if (Math.abs(x(d) - at) < Math.abs(x(best) - at)) best = d;
    if (best === last.current) return;
    if (last.current != null) haptics.selection();
    last.current = best;
    onChange(best);
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

const styles = StyleSheet.create({
  axis: {
    height: 13,
    marginTop: 6,
  },
  tick: {
    position: 'absolute',
    left: 0,
  },
  label: {
    position: 'absolute',
    top: 0,
    width: LABEL_BOX,
  },
});
