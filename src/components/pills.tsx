import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { layout, useColors } from '@/theme';

import { Text } from './text';

export interface Pill<T> {
  value: T;
  label: string;
}

/**
 * A row of pills to pick one of several, scrolling sideways when there are
 * many: categories on By Category, years on Where It Went and Income. The row
 * runs to the card's edges, so the pills scroll under them.
 */
export function Pills<T extends string | number>({
  options,
  value,
  onChange,
  locked,
  takesTaps,
  style,
}: {
  options: Pill<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Inside a card that opens Pro when tapped: shown, but not buttons of their own. */
  locked?: boolean;
  /**
   * Inside a card that opens something when tapped: a tap between the pills
   * stops at the row and doesn't open the card. The row takes it from inside
   * the scroll view, so a swipe that starts between two pills still scrolls.
   */
  takesTaps?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const pills = options.map((o) => {
    const selected = o.value === value;
    const label = (
      <Text variant="footnote" weight="600" color={selected ? 'text' : 'secondary'} numberOfLines={1}>
        {o.label}
      </Text>
    );
    if (locked) {
      return (
        <View key={o.value} style={[styles.pill, { backgroundColor: selected ? c.fillStrong : c.fill }]}>
          {label}
        </View>
      );
    }
    return (
      <Pressable
        key={o.value}
        onPress={() => {
          if (!selected) haptics.selection();
          onChange(o.value);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: selected ? c.fillStrong : c.fill },
          pressed && !selected && { opacity: 0.6 },
        ]}>
        {label}
      </Pressable>
    );
  });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, style]}
      contentContainerStyle={takesTaps ? styles.grow : styles.row}
      accessibilityRole="tablist">
      {takesTaps ? (
        <Pressable onPress={noop} accessible={false} style={[styles.row, styles.taps]}>
          {pills}
        </Pressable>
      ) : (
        pills
      )}
    </ScrollView>
  );
}

/**
 * A row of years, newest first, to look at a card for another year. Draws
 * nothing with one year or none: there is nothing to pick. A tap that misses
 * a pill stops at the row, so a card that opens something when tapped doesn't
 * open on a near miss.
 */
export function YearPills({
  years,
  value,
  onChange,
  style,
}: {
  years: number[];
  value: number;
  onChange: (year: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (years.length < 2) return null;
  return (
    <Pills
      options={years.map((y) => ({ value: y, label: String(y) }))}
      value={value}
      onChange={onChange}
      takesTaps
      style={style}
    />
  );
}

/** Takes the tap, the way the pills themselves do, so the card around the row doesn't get it. */
const noop = () => {};

const styles = StyleSheet.create({
  scroll: {
    marginHorizontal: -layout.margin,
    marginBottom: 14,
  },
  row: {
    paddingHorizontal: layout.margin,
    gap: 6,
  },
  // With few pills the content still fills the row, so a tap past the last pill is taken too.
  grow: {
    flexGrow: 1,
  },
  // The scroll view lays its content out in a row; a view standing in for it has to say so itself.
  taps: {
    flexDirection: 'row',
    flexGrow: 1,
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
  },
});
