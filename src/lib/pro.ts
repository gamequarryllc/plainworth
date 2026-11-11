import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * Plainworth Pro. Tracking net worth and spending is always free; Pro adds the
 * extras on top. Early buyers pay once and keep Pro for good.
 */
export type ProFeature = 'insights' | 'chart-values' | 'export' | 'sync';

export const PRO_FEATURES: { key: ProFeature; icon: SFSymbol; title: string; text: string }[] = [
  {
    key: 'insights',
    icon: 'chart.bar.xaxis',
    title: 'Insights',
    text: 'Charts of your progress: where your net worth is headed, goals like $1M by 50 in today’s money, this year against last, and lifestyle creep.',
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
  {
    key: 'sync',
    icon: 'icloud',
    title: 'Sync with iCloud',
    text: 'The same data on all your devices, through your own private iCloud. Off unless you turn it on.',
  },
];

/**
 * The launch price for lifetime Pro, shown until the App Store's own price (in
 * the buyer's currency) has loaded, and in Expo Go.
 */
export const LIFETIME_PRICE = '$14.99';
