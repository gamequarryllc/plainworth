import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

/** "‹ 2026 ›" style switcher for years and months. */
export function Stepper({
  label,
  onPrev,
  onNext,
  prevLabel = 'Previous',
  nextLabel = 'Next',
  canPrev = true,
  canNext = true,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel?: string;
  nextLabel?: string;
  /** False at the end of the range: the button dims and does nothing. */
  canPrev?: boolean;
  canNext?: boolean;
}) {
  const c = useColors();
  const button = (icon: 'chevron.left' | 'chevron.right', onPress: () => void, a11y: string, enabled: boolean) => (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      disabled={!enabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.fill },
        pressed && { opacity: 0.5 },
        !enabled && { opacity: 0.35 },
      ]}>
      <Icon name={icon} size={15} weight="semibold" color={c.text} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {button('chevron.left', onPrev, prevLabel, canPrev)}
      <Text variant="headline" tabular align="center" style={styles.label}>
        {label}
      </Text>
      {button('chevron.right', onNext, nextLabel, canNext)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.margin,
    marginTop: 4,
    marginBottom: 6,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
