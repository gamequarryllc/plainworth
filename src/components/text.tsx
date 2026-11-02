import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { fonts, type TextVariant, type, useColors, type Colors } from '@/theme';

type ColorName = 'text' | 'secondary' | 'tertiary' | 'tint' | 'up' | 'down' | 'warning';

export interface Props extends TextProps {
  variant?: TextVariant;
  color?: ColorName | (string & {});
  weight?: TextStyle['fontWeight'];
  /** Fixed-width digits so numbers line up. */
  tabular?: boolean;
  rounded?: boolean;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color = 'text', weight, tabular, rounded, align, style, ...rest }: Props) {
  const c = useColors();
  const resolved = color in c ? c[color as keyof Colors] : color;
  return (
    <RNText
      {...rest}
      style={[
        type[variant],
        { color: resolved },
        weight ? { fontWeight: weight } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        rounded && fonts.rounded ? { fontFamily: fonts.rounded } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
