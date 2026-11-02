import { formatPercent } from '@/lib/money';
import type { TextVariant } from '@/theme';
import { useMoney } from '@/hooks/use-money';

import { Text } from './text';

/**
 * A change in value, colored green or red. For debts, going down is good, so
 * pass `invert` to flip the colors.
 */
export function Change({
  delta,
  ratio,
  invert,
  variant = 'subheadline',
  suffix,
  weight = '600',
}: {
  delta: number;
  ratio?: number | null;
  invert?: boolean;
  variant?: TextVariant;
  suffix?: string;
  weight?: '400' | '500' | '600' | '700';
}) {
  const money = useMoney();
  const good = invert ? delta < 0 : delta > 0;
  const color = delta === 0 ? 'secondary' : good ? 'up' : 'down';
  const pct = ratio ? ` (${formatPercent(Math.abs(ratio))})` : '';
  return (
    <Text variant={variant} color={color} weight={weight} tabular numberOfLines={1}>
      {money(delta, { signed: true })}
      {pct}
      {suffix ? <Text variant={variant} color="secondary" weight="400">{` ${suffix}`}</Text> : null}
    </Text>
  );
}
