import { useLayoutEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { usePanGesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { makeMutable, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';

import { useScrollLock } from './screen';

/**
 * Shared state for rows that can be held and dragged into a new order, like
 * a list in Reminders. One per screen (`useDragRows`); each list on the
 * screen passes its own ids to its rows, and only one row moves at a time.
 */
class DragState {
  /** The row being dragged. */
  active = makeMutable<string | null>(null);
  /** How far the dragged row has moved from where it was laid out. */
  dragY = makeMutable(0);
  /** The dragged list's ids at the start, in their laid-out order. */
  start = makeMutable<string[]>([]);
  /** The same ids in the order they'd drop in now. */
  order = makeMutable<string[]>([]);
  /** Each row's height, from onLayout. */
  heights = makeMutable<Record<string, number>>({});
}

/**
 * `version` should change whenever the lists' order changes (for example the
 * joined ids), so rows drop their offsets the moment they're laid out in the
 * new order.
 */
export function useDragRows(version: string): DragState {
  const [state] = useState(() => new DragState());
  useLayoutEffect(() => {
    state.start.set([]);
    state.order.set([]);
    state.active.set(null);
    state.dragY.set(0);
  }, [state, version]);
  return state;
}

/** The hairline Section draws between rows. */
const GAP = StyleSheet.hairlineWidth;

/**
 * How far down the list `id` starts when the rows are in `list` order. Worked
 * out from row heights rather than layout positions, because the gesture
 * detector around each row makes onLayout report every row at the top.
 */
function topOf(list: string[], heights: Record<string, number>, id: string): number {
  'worklet';
  let top = 0;
  for (const other of list) {
    if (other === id) break;
    top += (heights[other] ?? 0) + GAP;
  }
  return top;
}

/** Where `id` would sit if the rows were in `order`, as an offset from where it's laid out. */
function offsetIn(order: string[], start: string[], heights: Record<string, number>, id: string): number {
  'worklet';
  return topOf(order, heights, id) - topOf(start, heights, id);
}

/** The order with `id` moved to wherever its middle now is. */
function orderAt(start: string[], heights: Record<string, number>, id: string, dragY: number): string[] {
  'worklet';
  const middle = topOf(start, heights, id) + dragY + (heights[id] ?? 0) / 2;
  const rest = start.filter((x) => x !== id);
  let slot = 0;
  for (const other of rest) {
    if (middle > topOf(start, heights, other) + (heights[other] ?? 0) / 2) slot += 1;
  }
  return [...rest.slice(0, slot), id, ...rest.slice(slot)];
}

function same(a: string[], b: string[]): boolean {
  'worklet';
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A row that can be held for a moment and then dragged up or down within
 * its list. Put it directly inside a Section, one per row, in `ids` order.
 */
export function DragRow({
  drag,
  id,
  ids,
  onReorder,
  children,
}: {
  drag: DragState;
  id: string;
  /** Every draggable row's id in this list, in order. */
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const lockScroll = useScrollLock();
  const { active, dragY, start, order, heights } = drag;

  const begin = () => {
    lockScroll(true);
    haptics.light();
  };
  const finish = (next: string[] | null) => {
    lockScroll(false);
    if (next) onReorder(next);
  };

  const gesture = usePanGesture({
    activateAfterLongPress: 350,
    enabled: ids.length > 1,
    onActivate: () => {
      'worklet';
      start.set(ids);
      order.set(ids);
      dragY.set(0);
      active.set(id);
      scheduleOnRN(begin);
    },
    onUpdate: (e) => {
      'worklet';
      if (active.value !== id) return;
      // Keep the row within its own list, clear of Add Category and the next section.
      const list = start.value;
      const top = topOf(list, heights.value, id);
      const last = list[list.length - 1];
      const bottom = topOf(list, heights.value, last) + (heights.value[last] ?? 0) - (heights.value[id] ?? 0);
      const y = Math.min(Math.max(e.translationY, -top), bottom - top);
      dragY.set(y);
      const next = orderAt(list, heights.value, id, y);
      if (!same(next, order.value)) {
        order.set(next);
        scheduleOnRN(haptics.selection);
      }
    },
    onFinalize: () => {
      'worklet';
      if (active.value !== id) return;
      const next = order.value;
      const changed = !same(next, start.value);
      dragY.set(
        withTiming(offsetIn(next, start.value, heights.value, id), { duration: 160 }, (done) => {
          if (!done) return;
          if (changed) {
            // The rows drop their offsets once they're laid out in the new order.
            scheduleOnRN(finish, next);
          } else {
            active.set(null);
            start.set([]);
            order.set([]);
            scheduleOnRN(finish, null);
          }
        }),
      );
    },
  });

  const style = useAnimatedStyle(() => {
    if (!start.value.includes(id))
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        zIndex: 0,
        shadowOpacity: 0,
      };
    if (active.value === id) {
      return {
        transform: [{ translateY: dragY.value }, { scale: 1.02 }],
        zIndex: 10,
        shadowOpacity: 0.18,
      };
    }
    const target = offsetIn(order.value, start.value, heights.value, id);
    return {
      transform: [{ translateY: withTiming(target, { duration: 160 }) }, { scale: 1 }],
      zIndex: 0,
      shadowOpacity: 0,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(e) => {
          const { height } = e.nativeEvent.layout;
          heights.modify((all) => {
            'worklet';
            all[id] = height;
            return all;
          });
        }}
        style={[
          {
            shadowColor: '#000',
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          },
          style,
        ]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export type { DragState };
