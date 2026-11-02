import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

interface Props {
  title: string;
  onPress: () => void;
  icon?: SFSymbol;
  /** filled: accent background. tinted: soft accent background. */
  kind?: 'filled' | 'tinted';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, icon, kind = 'filled', disabled, style }: Props) {
  const c = useColors();
  const filled = kind === 'filled';
  const fg = filled ? '#FFFFFF' : c.tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: filled ? c.tint : c.fill },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {icon ? <Icon name={icon} size={17} weight="semibold" color={fg} /> : null}
      <Text variant="headline" color={fg}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginHorizontal: layout.margin,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
