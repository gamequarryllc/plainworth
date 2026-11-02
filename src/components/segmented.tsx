import SegmentedControlClass, { type SegmentedControlProps } from '@react-native-segmented-control/segmented-control';
import type { ComponentType } from 'react';
import { StyleSheet, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { layout } from '@/theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

// The package's class typings predate React 19; the component itself is fine.
const SegmentedControl = SegmentedControlClass as unknown as ComponentType<SegmentedControlProps>;

/** The native iOS segmented control. */
export function Segmented<T extends string>({ options, value, onChange, style }: Props<T>) {
  const scheme = useColorScheme();
  return (
    <SegmentedControl
      values={options.map((o) => o.label)}
      selectedIndex={Math.max(0, options.findIndex((o) => o.value === value))}
      onChange={(e) => {
        const next = options[e.nativeEvent.selectedSegmentIndex];
        if (next && next.value !== value) {
          haptics.selection();
          onChange(next.value);
        }
      }}
      appearance={scheme === 'dark' ? 'dark' : 'light'}
      style={[styles.control, style]}
    />
  );
}

const styles = StyleSheet.create({
  control: {
    marginHorizontal: layout.margin,
    height: 32,
  },
});
