import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';

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

/** The amount's size, and the smallest it shrinks to when it's long. */
const SIZE = 54;
const MIN_SIZE = 30;
/** The currency symbol is drawn a little smaller than the digits. */
const SYMBOL_SCALE = 40 / 54;

/**
 * About how wide an amount is, in ems of its size: digits are tabular (about
 * 0.6em) and separators about 0.3em, plus the smaller symbol and the caret.
 */
function ems(text: string, symbol: string): number {
  let width = 0.1 + symbol.length * 0.62 * SYMBOL_SCALE;
  for (const ch of text) width += ch >= '0' && ch <= '9' ? 0.6 : 0.3;
  return width;
}

/** The large centered number for entering a new balance. Long amounts shrink to fit, like in Calculator. */
export function BigAmountInput({ text, onChangeText, placeholder, autoFocus, readOnly }: Props) {
  const c = useColors();
  const currency = useStore((s) => s.settings.currency);
  const { width } = useWindowDimensions();
  const input = useRef<TextInputInstance>(null);
  const empty = text === '';
  const symbol = currencySymbol(currency);
  const size = Math.max(MIN_SIZE, Math.min(SIZE, Math.floor((width * 0.84) / ems(text || placeholder, symbol))));
  const symbolSize = Math.round(size * SYMBOL_SCALE);
  return (
    <Pressable onPress={() => input.current?.focus()} style={styles.wrap} accessible={false}>
      <View style={styles.row}>
        {/* Its own line height: Text's default (body) one would clip the top of a glyph this big on iOS. */}
        <Text
          style={[
            styles.symbol,
            { fontSize: symbolSize, lineHeight: Math.ceil(symbolSize * 1.25), color: empty ? c.tertiary : c.text },
          ]}>
          {symbol}
        </Text>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(t) => onChangeText?.(formatTyping(t))}
          placeholder={placeholder}
          placeholderTextColor={c.tertiary}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          editable={!readOnly}
          style={[styles.input, { fontSize: size, color: c.text }]}
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
    // Stays the same height as long amounts shrink, so nothing below moves.
    minHeight: Math.ceil(SIZE * 1.2),
  },
  symbol: {
    fontWeight: '600',
    fontFamily: fonts.rounded,
    marginRight: 2,
  },
  input: {
    fontWeight: '700',
    fontFamily: fonts.rounded,
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    padding: 0,
  },
});
