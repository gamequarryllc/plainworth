import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { ProBadge } from './pro-badge';
import { Text } from './text';

/**
 * One finding, the way Health shows its highlights: a small label, a plain
 * sentence that says what happened, and a chart that shows it. With `onPress`,
 * a chevron by the label says there's more to see.
 */
export function InsightCard({
  label,
  sentence,
  note,
  folded,
  children,
  onPress,
  locked,
}: {
  label: string;
  sentence: string;
  /** A line of small print under the chart. */
  note?: string | null;
  /** Long small print stays behind a "How It's Figured" toggle until asked for. */
  folded?: boolean;
  children?: ReactNode;
  onPress?: () => void;
  /** Part of Pro: a PRO badge by the label, and the chart can't be touched. */
  locked?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const frame = [styles.card, { backgroundColor: c.card, borderColor: c.separator }];
  const content = (
    <>
      <View style={styles.labelRow}>
        <Text variant="footnote" weight="500" color="secondary" style={styles.label}>
          {label}
        </Text>
        {locked ? <ProBadge /> : null}
        {onPress ? <Icon name="chevron.right" size={12} weight="semibold" color={c.tertiary} /> : null}
      </View>
      <Text variant="callout" weight="500" style={styles.sentence}>
        {sentence}
      </Text>
      {children ? (
        <View style={styles.body} pointerEvents={locked ? 'none' : 'auto'}>
          {children}
        </View>
      ) : null}
      {note && folded ? (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          style={({ pressed }) => [styles.foldRow, pressed && { opacity: 0.5 }]}>
          <Text variant="footnote" color="secondary">
            How It’s Figured
          </Text>
          <Icon name={open ? 'chevron.up' : 'chevron.down'} size={11} weight="semibold" color={c.secondary} />
        </Pressable>
      ) : null}
      {note && (!folded || open) ? (
        <Text variant="footnote" color="secondary" style={folded ? styles.foldNote : styles.note}>
          {note}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [frame, pressed && { backgroundColor: c.cardPressed }]}>
      {content}
    </Pressable>
  );
}

export interface CompareBar {
  /** Inside the bar, e.g. the year. */
  label: string;
  value: number;
  /** Above the bar, e.g. "$2,980". */
  text: string;
  /** Small, after the text, e.g. "a month". */
  unit?: string;
  /** The highlighted bar (this period) gets the color; the others are gray. */
  color?: string;
}

/** This period against the last, as two bars, like Health's comparison highlights. */
export function CompareBars({ bars }: { bars: CompareBar[] }) {
  const c = useColors();
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  return (
    <View style={styles.compare}>
      {bars.map((b) => {
        // Nothing at all (a paid-off debt) shows as an empty bar, not a colored stub.
        const filled = !!b.color && b.value !== 0;
        return (
          <View key={b.label} accessible accessibilityLabel={`${b.label}: ${b.text}${b.unit ? ` ${b.unit}` : ''}`}>
            <Text numberOfLines={1}>
              <Text variant="title3" weight="700" rounded tabular>
                {b.text}
              </Text>
              {b.unit ? (
                <Text variant="subheadline" color="secondary">
                  {` ${b.unit}`}
                </Text>
              ) : null}
            </Text>
            <View
              style={[
                styles.compareBar,
                {
                  width: `${(Math.abs(b.value) / max) * 100}%`,
                  backgroundColor: b.value === 0 ? c.fill : (b.color ?? c.fillStrong),
                },
              ]}>
              <Text variant="footnote" weight="600" color={filled ? c.onTint : 'text'} numberOfLines={1}>
                {b.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** A ranked line: name and amount, with a thin bar for its size and a short note beside it. */
export function RankRow({
  title,
  value,
  valueColor,
  share,
  color,
  note,
  noteColor,
  onPress,
}: {
  title: string;
  value: string;
  valueColor?: 'up' | 'down';
  /** 0 to 1, the bar's length. */
  share: number;
  color: string;
  note?: string;
  noteColor?: 'up' | 'down' | 'secondary';
  /** Makes the row a button, e.g. to open its month-by-month chart. */
  onPress?: () => void;
}) {
  const c = useColors();
  const body = (
    <>
      <View style={styles.rankTop}>
        <Text numberOfLines={1} style={styles.rankTitle}>
          {title}
        </Text>
        <Text tabular color={valueColor ?? 'text'}>
          {value}
        </Text>
      </View>
      <View style={styles.rankBottom}>
        <View style={[styles.track, { backgroundColor: c.fill }]}>
          <View style={[styles.fill, { width: `${Math.max(1.5, share * 100)}%`, backgroundColor: color }]} />
        </View>
        {note ? (
          <Text variant="footnote" tabular color={noteColor ?? 'secondary'} style={styles.rankNote}>
            {note}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.rank}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Shows it month by month"
      style={({ pressed }) => [styles.rank, pressed && { opacity: 0.5 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.margin,
    paddingTop: 24,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    flex: 1,
  },
  sentence: {
    marginTop: 4,
  },
  body: {
    marginTop: 14,
  },
  note: {
    marginTop: 12,
  },
  foldRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  foldNote: {
    marginTop: 6,
  },
  compare: {
    gap: 10,
  },
  compareBar: {
    minWidth: 64,
    height: 26,
    marginTop: 3,
    borderRadius: 7,
    borderCurve: 'continuous',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  rank: {
    paddingVertical: 7,
    gap: 6,
  },
  rankTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  rankTitle: {
    flex: 1,
  },
  rankBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  rankNote: {
    minWidth: 52,
    textAlign: 'right',
  },
});
