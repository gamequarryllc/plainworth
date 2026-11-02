import { Platform, useColorScheme } from 'react-native';

/**
 * Colors follow Apple's system palette so the app sits naturally next to
 * Settings, Wallet and Stocks, in light and dark mode.
 */
const light = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  cardPressed: '#E5E5EA',
  text: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.29)',
  fill: 'rgba(118,118,128,0.12)',
  fillStrong: 'rgba(118,118,128,0.2)',
  tint: '#007AFF',
  up: '#34C759',
  down: '#FF3B30',
  warning: '#FF9500',
  chartGrid: 'rgba(60,60,67,0.18)',
  bar: '#007AFF',
  invest: '#AF52DE',
  barMuted: 'rgba(0,122,255,0.3)',
};

const dark: typeof light = {
  background: '#000000',
  card: '#1C1C1E',
  cardPressed: '#2C2C2E',
  text: '#FFFFFF',
  secondary: 'rgba(235,235,245,0.6)',
  tertiary: 'rgba(235,235,245,0.3)',
  separator: 'rgba(84,84,88,0.65)',
  fill: 'rgba(118,118,128,0.24)',
  fillStrong: 'rgba(118,118,128,0.32)',
  tint: '#0A84FF',
  up: '#30D158',
  down: '#FF453A',
  warning: '#FF9F0A',
  chartGrid: 'rgba(235,235,245,0.18)',
  bar: '#0A84FF',
  invest: '#BF5AF2',
  barMuted: 'rgba(10,132,255,0.5)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  /** SF Pro Rounded on iOS, used for the big headline numbers. */
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
};

/**
 * iOS text styles at the "Medium" Dynamic Type size, one notch below the
 * default, so more of each screen fits without scrolling.
 */
export const type = {
  largeTitle: { fontSize: 33, lineHeight: 40, fontWeight: '700' as const },
  title1: { fontSize: 27, lineHeight: 33, fontWeight: '700' as const },
  title2: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const },
  title3: { fontSize: 19, lineHeight: 24, fontWeight: '600' as const },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 21, fontWeight: '400' as const },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  subheadline: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  caption: { fontSize: 11, lineHeight: 13, fontWeight: '400' as const },
};

export type TextVariant = keyof typeof type;

/** iOS 26 rounds and pads grouped lists more than earlier versions. */
const modernIOS = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

export const layout = {
  /** Where text starts from the edge of the screen. Lists run edge to edge, with rows indented by this much. */
  margin: 16,
  /** Corner radius for floating things like menus. Lists and cards are square. */
  radius: Platform.OS === 'android' ? 16 : Platform.OS === 'ios' && !modernIOS ? 10 : 26,
  rowHeight: Platform.OS === 'ios' && !modernIOS ? 44 : 46,
};
