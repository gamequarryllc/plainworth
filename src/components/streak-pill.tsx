import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useToday } from '@/hooks/use-today';
import { spendHistory, spendStreaks } from '@/lib/trends';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

/**
 * How many months in a row you've kept at least 20% of what you earned, at the
 * top of Spending. It goes up once a month, when a month that kept 20% is over,
 * and opens the Spending side of Insights. Hidden until there's a streak.
 */
export function StreakPill() {
  const c = useColors();
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const { keeping } = spendStreaks(spendHistory({ spend, spendCategories }, today), today);
  if (keeping < 1) return null;
  const text = keeping === 1 ? '1 month keeping 20%+' : `${keeping} months in a row keeping 20%+`;
  return (
    <Pressable
      onPress={() => router.navigate({ pathname: '/insights', params: { part: 'spending' } })}
      accessibilityRole="button"
      accessibilityLabel={`Streak: ${text}`}
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? c.fillStrong : c.fill }]}>
      <Icon name="flame.fill" size={13} color={c.warning} />
      <Text variant="footnote" weight="600">
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginHorizontal: layout.margin,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
});
