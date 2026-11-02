import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * Plainworth Pro. Tracking net worth and spending is always free; Pro adds the
 * extras on top. Early buyers pay once and keep Pro for good.
 */
export type ProFeature = 'insights' | 'chart-values' | 'export';

export const PRO_FEATURES: { key: ProFeature; icon: SFSymbol; title: string; text: string }[] = [
  {
    key: 'insights',
    icon: 'chart.bar.xaxis',
    title: 'Insights',
    text: 'Charts of your progress: where your net worth is headed, this year against last, and lifestyle creep.',
  },
  {
    key: 'chart-values',
    icon: 'hand.draw',
    title: 'Exact Values on Every Range',
    text: 'Drag across a chart to read any past balance, not just on All.',
  },
  {
    key: 'export',
    icon: 'tablecells',
    title: 'Export to Excel',
    text: 'Every balance and every month of spending in one spreadsheet.',
  },
];

/**
 * The launch price for lifetime Pro, shown until the App Store's own price (in
 * the buyer's currency) has loaded, and in Expo Go.
 */
export const LIFETIME_PRICE = '$14.99';
