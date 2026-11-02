import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, useColorScheme } from 'react-native';

import { formatTime } from '@/lib/dates';
import { useColors } from '@/theme';

import { Text } from './text';

interface Props {
  /** Minutes after midnight. */
  value: number;
  onChange: (value: number) => void;
}

const dateOf = (minutes: number) => {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
};
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** The compact iOS time button (opens a wheel), like the Clock app's. */
export function TimeField({ value, onChange }: Props) {
  const c = useColors();
  const scheme = useColorScheme();

  if (Platform.OS === 'android') {
    return (
      <Pressable
        onPress={() =>
          DateTimePickerAndroid.open({
            value: dateOf(value),
            mode: 'time',
            onValueChange: (_e, d) => onChange(minutesOf(d)),
          })
        }>
        <Text color="tint">{formatTime(dateOf(value).getTime())}</Text>
      </Pressable>
    );
  }

  return (
    <DateTimePicker
      value={dateOf(value)}
      mode="time"
      display="compact"
      minuteInterval={5}
      accentColor={c.tint}
      themeVariant={scheme === 'dark' ? 'dark' : 'light'}
      onValueChange={(_e, d) => onChange(minutesOf(d))}
    />
  );
}
