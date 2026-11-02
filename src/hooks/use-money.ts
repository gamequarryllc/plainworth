import { useCallback } from 'react';

import { formatMoney, MASK, type MoneyOptions } from '@/lib/money';
import { useStore } from '@/store';

export type FormatMoney = (cents: number, opts?: MoneyOptions & { reveal?: boolean }) => string;

/** Formats amounts in the chosen currency, masking them when "Hide Amounts" is on. */
export function useMoney(): FormatMoney {
  const currency = useStore((s) => s.settings.currency);
  const hidden = useStore((s) => s.settings.hideAmounts);
  return useCallback(
    (cents, opts) => (hidden && !opts?.reveal ? MASK : formatMoney(cents, currency, opts)),
    [currency, hidden],
  );
}
