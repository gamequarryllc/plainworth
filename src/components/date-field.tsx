import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, useColorScheme } from 'react-native';

import { dateFromKey, dateKey, formatDate } from '@/lib/dates';
import type { DateKey } from '@/lib/types';
import { useColors } from '@/theme';

import { Text } from './text';

interface Props {
  value: DateKey;
  onChange: (value: DateKey) => void;
  maximum?: DateKey;
}

/** The compact iOS date button (opens a calendar). */
export function DateField({ value, onChange, maximum }: Props) {
  const c = useColors();
  const scheme = useColorScheme();
  const date = dateFromKey(value);
  const max = maximum ? dateFromKey(maximum) : undefined;

  if (Platform.OS === 'android') {
    return (
      <Pressable
        onPress={() =>
          DateTimePickerAndroid.open({
            value: date,
            mode: 'date',
            maximumDate: max,
            onValueChange: (_e, d) => onChange(dateKey(d)),
          })
        }>
        <Text color="tint">{formatDate(value)}</Text>
      </Pressable>
    );
  }

  return (
    <DateTimePicker
      value={date}
      mode="date"
      display="compact"
      maximumDate={max}
      accentColor={c.tint}
      themeVariant={scheme === 'dark' ? 'dark' : 'light'}
      onValueChange={(_e, d) => onChange(dateKey(d))}
    />
  );
}
