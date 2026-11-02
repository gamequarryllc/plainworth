import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { currencySymbol, formatTyping } from '@/lib/money';
import { useStore } from '@/store';
import { fonts, useColors } from '@/theme';

import { Text } from './text';

interface Props {
  /** Raw typed text (already tidied with formatTyping). */
  text: string;
  onChangeText?: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** Show a computed value that can't be typed into. */
  readOnly?: boolean;
}

/** The large centered number for entering a new balance. */
export function BigAmountInput({ text, onChangeText, placeholder, autoFocus, readOnly }: Props) {
  const c = useColors();
  const currency = useStore((s) => s.settings.currency);
  const input = useRef<TextInputInstance>(null);
  const empty = text === '';
  return (
    <Pressable onPress={() => input.current?.focus()} style={styles.wrap} accessible={false}>
      <View style={styles.row}>
        <Text style={[styles.symbol, { color: empty ? c.tertiary : c.text }]}>{currencySymbol(currency)}</Text>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(t) => onChangeText?.(formatTyping(t))}
          placeholder={placeholder}
          placeholderTextColor={c.tertiary}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          editable={!readOnly}
          style={[styles.input, { color: c.text }]}
          accessibilityLabel="Amount"
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '92%',
  },
  symbol: {
    fontSize: 40,
    fontWeight: '600',
    fontFamily: fonts.rounded,
    marginRight: 2,
  },
  input: {
    fontSize: 54,
    fontWeight: '700',
    fontFamily: fonts.rounded,
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    padding: 0,
  },
});
