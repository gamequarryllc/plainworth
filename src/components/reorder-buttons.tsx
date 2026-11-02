import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Icon } from './icon';

/** Move up / move down controls shown while reordering a list. */
export function ReorderButtons({
  onUp,
  onDown,
  canUp,
  canDown,
}: {
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const c = useColors();
  const button = (icon: 'chevron.up' | 'chevron.down', enabled: boolean, onPress: () => void, label: string) => (
    <Pressable
      disabled={!enabled}
      hitSlop={6}
      accessibilityLabel={label}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.button, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}>
      <Icon name={icon} size={14} weight="semibold" color={enabled ? c.text : c.tertiary} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {button('chevron.up', canUp, onUp, 'Move up')}
      {button('chevron.down', canDown, onDown, 'Move down')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    width: 32,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
