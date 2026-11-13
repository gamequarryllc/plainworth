import type { ComponentProps } from 'react';

import type { FormatMoney } from '@/hooks/use-money';
import { formatPercent, MASK } from '@/lib/money';
import type { CategoryTotal } from '@/lib/spending';
import { useColors } from '@/theme';

import { InsightCard, RankRow } from './insight-card';

/**
 * What was earned over a year, by source, biggest first: an Insights card.
 * Draws nothing when no income was entered.
 */
export function IncomeSources({
  totals,
  when,
  money,
  sentence = (answer) => answer,
  card,
  masked,
}: {
  totals: CategoryTotal[];
  /** "this year" or "in 2025". */
  when: string;
  money: FormatMoney;
  /** For the Pro preview: picks the teaser over the answer. */
  sentence?: (answer: string, teaser: string) => string;
  card?: Partial<ComponentProps<typeof InsightCard>>;
  masked?: boolean;
}) {
  const c = useColors();
  if (!totals.length) return null;
  const sum = totals.reduce((a, t) => a + t.total, 0);
  return (
    <InsightCard
      label="Income"
      sentence={sentence(
        `You earned ${money(sum, { whole: true })} ${when}.`,
        'See what you earned this year, by source.',
      )}
      {...card}>
      {totals.map((t) => (
        <RankRow
          key={t.category.id}
          title={t.category.name}
          value={money(t.total, { whole: true })}
          share={t.share / totals[0].share}
          color={c.up}
          note={masked ? MASK : formatPercent(t.share)}
        />
      ))}
    </InsightCard>
  );
}
