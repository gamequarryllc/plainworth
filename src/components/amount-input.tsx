import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextInputInstance, type TextStyle } from 'react-native';

import { centsToInput, formatTyping, parseAmount } from '@/lib/money';
import { useMoney } from '@/hooks/use-money';
import { type, useColors } from '@/theme';

interface Props {
  value: number | null | undefined;
  /** Called while typing. Clearing the field restores the original value. */
  onChange: (cents: number | null) => void;
  placeholder?: string;
  /** Hint shown while typing when there's no value yet (e.g. the current balance). */
  hint?: number | null;
  style?: StyleProp<TextStyle>;
  ref?: Ref<TextInputInstance>;
  inputAccessoryViewID?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  accessibilityLabel?: string;
}

/**
 * A right-aligned amount field for lists. Tapping it starts fresh (the current
 * value shows as a hint), so typing replaces the number instead of appending.
 */
export function AmountInput({
  value,
  onChange,
  placeholder = '$0',
  hint,
  style,
  ref,
  inputAccessoryViewID,
  onFocus,
  onBlur,
  accessibilityLabel,
}: Props) {
  const c = useColors();
  const money = useMoney();
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState<number | null>(null);
  const editing = text != null;

  return (
    <TextInput
      ref={ref}
      value={editing ? text : value ? money(value) : ''}
      placeholder={editing ? formatTyping(centsToInput(original ?? hint ?? 0)) || '0' : placeholder}
      placeholderTextColor={c.tertiary}
      keyboardType="decimal-pad"
      inputAccessoryViewID={inputAccessoryViewID}
      accessibilityLabel={accessibilityLabel}
      onFocus={() => {
        setOriginal(value ?? null);
        setText('');
        onFocus?.();
      }}
      onChangeText={(t) => {
        const formatted = formatTyping(t);
        setText(formatted);
        onChange(formatted === '' ? original : parseAmount(formatted));
      }}
      onBlur={() => {
        setText(null);
        onBlur?.();
      }}
      style={[styles.input, { color: c.text }, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: type.body.fontSize,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    width: 124,
    flexShrink: 0,
    paddingVertical: 4,
  },
});
