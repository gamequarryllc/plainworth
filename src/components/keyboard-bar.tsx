import { useRef, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

export const KEYBOARD_BAR_ID = 'tally-keyboard-bar';

/** Keeps refs to a list of fields so the keyboard bar can jump between them. */
export function useFieldChain() {
  const refs = useRef<(TextInputInstance | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  return {
    ref: (index: number) => (el: TextInputInstance | null) => {
      refs.current[index] = el;
    },
    onFocus: (index: number) => () => setFocused(index),
    focused,
    go(step: -1 | 1) {
      if (focused == null) return;
      const next = refs.current[focused + step];
      if (next) {
        haptics.selection();
        next.focus();
      }
    },
  };
}

/** Previous / Next / Done above the number pad, so a whole month can be entered quickly. */
export function KeyboardBar({ chain, count }: { chain: ReturnType<typeof useFieldChain>; count: number }) {
  const c = useColors();
  if (Platform.OS !== 'ios') return null;
  const { focused } = chain;
  const canPrev = focused != null && focused > 0;
  const canNext = focused != null && focused < count - 1;
  return (
    <InputAccessoryView nativeID={KEYBOARD_BAR_ID}>
      <View style={styles.bar}>
        <View style={[styles.group, { backgroundColor: c.card }]}>
          <Pressable onPress={() => chain.go(-1)} disabled={!canPrev} hitSlop={8} style={styles.arrow} accessibilityLabel="Previous field">
            <Icon name="chevron.up" size={18} weight="semibold" color={canPrev ? c.text : c.tertiary} />
          </Pressable>
          <Pressable onPress={() => chain.go(1)} disabled={!canNext} hitSlop={8} style={styles.arrow} accessibilityLabel="Next field">
            <Icon name="chevron.down" size={18} weight="semibold" color={canNext ? c.text : c.tertiary} />
          </Pressable>
        </View>
        <Pressable onPress={() => Keyboard.dismiss()} style={[styles.done, { backgroundColor: c.tint }]} accessibilityRole="button">
          <Text variant="headline" color="#FFFFFF">
            Done
          </Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  group: {
    flexDirection: 'row',
    borderRadius: 20,
    paddingHorizontal: 6,
    height: 40,
    alignItems: 'center',
  },
  arrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    borderRadius: 20,
    height: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
