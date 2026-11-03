import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { dayNumber, formatDate, formatTime, keyFromDayNumber, parseDateKey } from '@/lib/dates';
import { leadStart, rangeCaption, rangeStart, seriesChange, sliceSeries, type SeriesPoint } from '@/lib/networth';
import type { DateKey, RangeKey } from '@/lib/types';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { useStore } from '@/store';
import { openPaywall, usePro } from '@/store/pro';
import { useColors } from '@/theme';

import { Change } from './change';
import { Hero } from './hero';
import { Icon } from './icon';
import { LineChart } from './line-chart';
import { ProBadge } from './pro-badge';
import { RangePicker } from './range-picker';
import { Text } from './text';

/**
 * Big value, change over the selected range, and a chart you can drag across
 * to read past values. Shared by net worth, categories and accounts.
 */
export function TrendHeader({
  label,
  current,
  series,
  invert,
}: {
  label?: string;
  current: number;
  series: SeriesPoint[];
  /** For debts: a falling balance is shown in green. */
  invert?: boolean;
}) {
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const range = useStore((s) => s.settings.nwRange);
  const updateSettings = useStore((s) => s.updateSettings);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const [scrub, setScrub] = useState<number | null>(null);
  const animated = useAnimatedNumber(current);
  // Without Pro, dragging reads exact values only on All. Other ranges show a
  // small hint instead, which stays a few seconds after the finger lifts so it can be tapped.
  const pro = usePro();
  const gated = range !== 'ALL' && !pro;
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHintTimer = () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = null;
  };
  useEffect(() => clearHintTimer, []);
  const onScrub = (i: number | null) => {
    setScrub(i);
    if (!gated) return;
    clearHintTimer();
    setHint(true);
    if (i == null) hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
  };

  const points = sliceSeries(series, range, today);
  const scrubbed = scrub != null && !gated ? points[scrub] : undefined;
  const showHint = gated && (scrub != null || hint);
  const overall = seriesChange(points);
  const shown = scrubbed ? seriesChange(points, scrub!) : overall;
  const good = invert ? overall.delta <= 0 : overall.delta >= 0;
  const caption = scrubbed ? scrubLabel(scrubbed, today) : periodLabel(series, range, today);

  return (
    <>
      <Hero
        label={label}
        value={money(scrubbed ? scrubbed.value : animated)}
        caption={
          showHint ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => openPaywall('chart-values')}
              style={({ pressed }) => [styles.hint, pressed && { opacity: 0.5 }]}>
              <ProBadge />
              <Text variant="subheadline" color="secondary" numberOfLines={1}>
                Upgrade to see exact values
              </Text>
              <Icon name="chevron.right" size={11} weight="semibold" color={c.tertiary} />
            </Pressable>
          ) : points.length > 0 ? (
            <Change
              delta={shown.delta}
              ratio={shown.ratio}
              invert={invert}
              suffix={caption}
            />
          ) : null
        }
      />
      {points.length > 0 ? (
        <LineChart
          points={points}
          color={good ? c.up : c.down}
          from={leadStart(series, range, today)}
          grid
          formatTick={hidden ? undefined : (v) => money(v, { compact: true, whole: true })}
          onScrub={onScrub}
          axis
        />
      ) : null}
      <RangePicker value={range} onChange={(r) => updateSettings({ nwRange: r })} />
    </>
  );
}

/**
 * "Nov 1, 2025", or on a day with more than one update, the time it was made:
 * "Nov 1, 2:05 PM" (the year only when it isn't this year, so it fits on one line).
 */
function scrubLabel(p: SeriesPoint, today: DateKey): string {
  const key = keyFromDayNumber(p.day);
  if (p.at == null) return formatDate(key);
  return `${formatDate(key, { year: parseDateKey(key).y !== parseDateKey(today).y })}, ${formatTime(p.at)}`;
}

/** How long the Pro hint stays after the finger lifts. */
const HINT_MS = 4000;

/**
 * "Past 6 Months", unless tracking started more recently than that, in which
 * case the change really is "Since Mar 4" (or "Today" on day one).
 */
function periodLabel(series: SeriesPoint[], range: RangeKey, today: DateKey): string {
  const start = rangeStart(range, today);
  const first = series[0]?.day;
  if (first == null || start == null || first <= start) return rangeCaption(range);
  if (first >= dayNumber(today)) return 'Today';
  const key = keyFromDayNumber(first);
  return `Since ${formatDate(key, { year: parseDateKey(key).y !== parseDateKey(today).y })}`;
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
