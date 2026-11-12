import { useRef, useState } from 'react';
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

/** Space between the symbol and the first digit. */
const GAP = 2;

/**
 * The large centered number for entering a new balance. Long amounts shrink to fit, like in Calculator.
 *
 * The field spans the whole row with its text centered, instead of growing with
 * the number: an iOS text field that resizes as you type scrolls its text to
 * keep the caret in view, and when a comma appears it can stay scrolled and cut
 * off the first digit. The symbol sits just left of the measured number.
 */
export function BigAmountInput({ text, onChangeText, placeholder, autoFocus, readOnly }: Props) {
  const c = useColors();
  const currency = useStore((s) => s.settings.currency);
  const { width } = useWindowDimensions();
  const input = useRef<TextInputInstance>(null);
  const empty = text === '';
  const symbol = currencySymbol(currency);
  const shown = text || placeholder;
  const size = Math.max(MIN_SIZE, Math.min(SIZE, Math.floor((width * 0.84) / ems(shown, symbol))));
  const symbolSize = Math.round(size * SYMBOL_SCALE);
  const rowWidth = Math.round(width * 0.92);

  // Measured widths; until a layout arrives, fall back to the estimate.
  const [measured, setMeasured] = useState<{ key: string; width: number } | null>(null);
  const [symbolWidth, setSymbolWidth] = useState<number | null>(null);
  const key = `${shown}|${size}`;
  const numberWidth = measured?.key === key ? measured.width : (ems(shown, '') - 0.1) * size;
  const symW = symbolWidth ?? symbol.length * 0.62 * symbolSize;
  // The field's left padding makes room for the symbol, so symbol + number is centered as a whole.
  const pad = symW + GAP;
  const numberLeft = pad + (rowWidth - pad - numberWidth) / 2;

  const numberStyle = [styles.input, { fontSize: size, lineHeight: Math.ceil(size * 1.2) }];
  return (
    <Pressable onPress={() => input.current?.focus()} style={styles.wrap} accessible={false}>
      <View style={[styles.row, { width: rowWidth }]}>
        {/* Off screen copy of the number, only to measure how wide it draws. */}
        <Text
          numberOfLines={1}
          style={[numberStyle, styles.measure]}
          onLayout={(e) => setMeasured({ key, width: e.nativeEvent.layout.width })}
          accessible={false}>
          {shown}
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
          style={[styles.input, styles.field, { fontSize: size, paddingLeft: pad, color: c.text }]}
          accessibilityLabel="Amount"
        />
        <View pointerEvents="none" style={[styles.symbolBox, { left: Math.max(0, numberLeft - GAP - symW) }]}>
          {/* Its own line height: Text's default (body) one would clip the top of a glyph this big on iOS. */}
          <Text
            onLayout={(e) => setSymbolWidth(e.nativeEvent.layout.width)}
            style={[
              styles.symbol,
              { fontSize: symbolSize, lineHeight: Math.ceil(symbolSize * 1.25), color: empty ? c.tertiary : c.text },
            ]}>
            {symbol}
          </Text>
        </View>
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
    justifyContent: 'center',
    // Stays the same height as long amounts shrink, so nothing below moves.
    minHeight: Math.ceil(SIZE * 1.2),
  },
  symbolBox: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  symbol: {
    fontWeight: '600',
    fontFamily: fonts.rounded,
  },
  measure: {
    position: 'absolute',
    top: -1000,
    left: 0,
    opacity: 0,
  },
  field: {
    width: '100%',
    textAlign: 'center',
  },
  input: {
    fontWeight: '700',
    fontFamily: fonts.rounded,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
});
