import { Platform, useColorScheme } from 'react-native';

/**
 * Colors follow Apple's system palette so the app sits naturally next to
 * Settings, Wallet and Stocks, in light and dark mode.
 */
const light = {
  background: '#FFFFFF',
  card: '#FFFFFF',
  cardPressed: '#F2F2F4',
  /** Menus, popovers and the keyboard bar float above the page. */
  elevated: '#FFFFFF',
  text: '#0A0A0A',
  secondary: 'rgba(60,60,67,0.55)',
  tertiary: 'rgba(60,60,67,0.28)',
  separator: 'rgba(60,60,67,0.14)',
  fill: 'rgba(118,118,128,0.10)',
  fillStrong: 'rgba(118,118,128,0.18)',
  /** Minimal look: one ink color for actions; color is saved for up and down. */
  tint: '#0A0A0A',
  onTint: '#FFFFFF',
  up: '#1FA855',
  down: '#E5484D',
  warning: '#E08A00',
  chartGrid: 'rgba(60,60,67,0.08)',
  bar: '#0A0A0A',
  invest: 'rgba(10,10,10,0.45)',
  barMuted: 'rgba(10,10,10,0.18)',
};

const dark: typeof light = {
  background: '#000000',
  card: '#000000',
  cardPressed: '#141416',
  elevated: '#1C1C1E',
  text: '#F5F5F7',
  secondary: 'rgba(235,235,245,0.52)',
  tertiary: 'rgba(235,235,245,0.26)',
  separator: 'rgba(235,235,245,0.10)',
  fill: 'rgba(118,118,128,0.18)',
  fillStrong: 'rgba(118,118,128,0.28)',
  tint: '#F5F5F7',
  onTint: '#000000',
  up: '#3DD68C',
  down: '#FF6369',
  warning: '#FFB224',
  chartGrid: 'rgba(235,235,245,0.07)',
  bar: '#F5F5F7',
  invest: 'rgba(245,245,247,0.45)',
  barMuted: 'rgba(245,245,247,0.2)',
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
  largeTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.6 },
  /** The one big number per screen: lighter weight, tight tracking. */
  display: { fontSize: 40, lineHeight: 46, fontWeight: '600' as const, letterSpacing: -1.2 },
  title1: { fontSize: 27, lineHeight: 33, fontWeight: '700' as const },
  title2: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const },
  title3: { fontSize: 19, lineHeight: 24, fontWeight: '600' as const },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const, letterSpacing: -0.1 },
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
