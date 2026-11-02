import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Text } from './text';

export interface SwipeAction {
  label: string;
  /** Background color of the button. */
  color: string;
  /**
   * Called with a function that slides the row closed. Actions that keep the
   * row (Edit) close it right away; ones that may remove it close it only if
   * the row stays, for example when a confirmation is cancelled.
   */
  onPress: (close: () => void) => void;
}

const ACTION_WIDTH = 78;

/**
 * Remembers the open row so that opening another one closes it, the way Mail
 * and Reminders behave. Create one per list with `useRef(new SwipeGroup())`.
 */
export class SwipeGroup {
  private open: SwipeableMethods | null = null;
  opened(row: SwipeableMethods | null) {
    if (this.open && this.open !== row) this.open.close();
    this.open = row;
  }
  closed(row: SwipeableMethods | null) {
    if (this.open === row) this.open = null;
  }
}

/** A list row that reveals action buttons when swiped to the left. */
export function SwipeRow({
  actions,
  group,
  children,
}: {
  actions: SwipeAction[];
  group?: SwipeGroup;
  children: ReactNode;
}) {
  const c = useColors();
  const ref = useRef<SwipeableMethods>(null);
  useEffect(() => {
    const row = ref.current;
    return () => group?.closed(row);
  }, [group]);
  return (
    <Swipeable
      ref={ref}
      friction={1.6}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        haptics.selection();
        group?.opened(ref.current);
      }}
      onSwipeableClose={() => group?.closed(ref.current)}
      renderRightActions={(_progress, translation, methods) => (
        <Actions actions={actions} translation={translation} methods={methods} />
      )}>
      <View style={{ backgroundColor: c.card }}>{children}</View>
    </Swipeable>
  );
}

function Actions({
  actions,
  translation,
  methods,
}: {
  actions: SwipeAction[];
  translation: SharedValue<number>;
  methods: SwipeableMethods;
}) {
  const width = ACTION_WIDTH * actions.length;
  // Slide the buttons in with the row instead of uncovering them in place.
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, translation.value + width) }],
  }));
  return (
    <Animated.View style={[styles.actions, { width }, slide]}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          onPress={() => action.onPress(() => methods.close())}
          style={({ pressed }) => [styles.action, { backgroundColor: action.color }, pressed && styles.pressed]}>
          <Text variant="subheadline" weight="600" color="#FFFFFF" numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
