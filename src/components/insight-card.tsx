import { BlurView } from 'expo-blur';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { ProBadge } from './pro-badge';
import { Text } from './text';

/**
 * One finding, the way Health shows its highlights: a small label, one short
 * sentence that says what happened, and a chart that shows it. Small print
 * waits behind an (i) by the label. With `onPress`, a chevron by the label
 * says there's more to see.
 */
export function InsightCard({
  label,
  sentence,
  note,
  children,
  onPress,
  locked,
}: {
  label: string;
  sentence: string;
  /** Small print on how it's figured, shown when the (i) is tapped. */
  note?: string | null;
  children?: ReactNode;
  onPress?: () => void;
  /** Part of Pro: a PRO badge by the label, and the chart is blurred behind an Unlock with Pro tag. */
  locked?: boolean;
}) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const [open, setOpen] = useState(false);
  const frame = [styles.card, { backgroundColor: c.card, borderColor: c.separator }];
  const content = (
    <>
      <View style={styles.labelRow}>
        <Text variant="footnote" weight="600" color="secondary" style={styles.label}>
          {label}
        </Text>
        {locked ? <ProBadge /> : null}
        {note ? (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="How it’s figured"
            accessibilityState={{ expanded: open }}>
            <Icon name="info.circle" size={15} color={open ? c.tint : c.tertiary} />
          </Pressable>
        ) : null}
        {onPress ? <Icon name="chevron.right" size={12} weight="semibold" color={c.tertiary} /> : null}
      </View>
      <Text variant="headline" style={styles.sentence}>
        {sentence}
      </Text>
      {children ? (
        <View style={styles.body} pointerEvents={locked ? 'none' : 'auto'}>
          {children}
          {locked ? (
            <>
              <BlurView intensity={28} tint={dark ? 'dark' : 'light'} style={styles.blur} />
              <View style={styles.unlock}>
                <View style={[styles.unlockTag, { backgroundColor: c.fillStrong }]}>
                  <Icon name="lock.fill" size={12} weight="semibold" color={c.text} />
                  <Text variant="subheadline" weight="600">
                    Unlock with Pro
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
      {note && open ? (
        <Text variant="footnote" color="secondary" style={styles.note}>
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
    marginTop: 12,
    paddingHorizontal: layout.margin,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  // Out to the card's edges, so the blur has no visible border.
  blur: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: -layout.margin,
    right: -layout.margin,
  },
  unlock: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  note: {
    marginTop: 12,
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
