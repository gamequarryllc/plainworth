import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { InsightCard, RankRow } from '@/components/insight-card';
import { PreviewFooter, useInsightsPreview } from '@/components/insights-preview';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { parseDateKey } from '@/lib/dates';
import { monthsLabel, recentMonths, spendingMonths, spendingYear } from '@/lib/insights';
import { formatPercent } from '@/lib/money';
import { groupTitle } from '@/lib/spending';
import type { SpendGroup } from '@/lib/types';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';

const GROUPS: SpendGroup[] = ['recurring', 'variable'];

/** Every spending category for a year (or the preview's two months), a month on average, by group. */
export default function WhereItWentScreen() {
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const preview = useInsightsPreview();
  const params = useLocalSearchParams<{ year?: string }>();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const now = parseDateKey(today);
  const year = Number(params.year) || now.y;
  const whole = (cents: number) => money(cents, { whole: true });
  const signed = (cents: number) => money(cents, { signed: true, whole: true });

  const data = { spend, spendCategories };
  const months = preview ? recentMonths(today) : null;
  const sp = months ? spendingMonths(data, months) : spendingYear(data, year, today);
  const spBefore = months ? null : spendingYear(data, year - 1, today);
  const canCompare = !!sp && !!spBefore && sp.months >= 2 && spBefore.months >= 2;
  const lastYearMonthly = new Map(spBefore?.categories.map((x) => [x.category.id, x.monthly]) ?? []);
  const when = months ? `in ${monthsLabel(months)}` : year === now.y ? 'this year' : `in ${year}`;

  if (!sp || (!sp.categories.length && !sp.invested.length)) {
    return (
      <Screen title="Where It Went">
        <Section footer={`Nothing spent in ${months ? monthsLabel(months) : year} yet.`}>
          <Row title="Open Spending" titleColor="tint" chevron={false} onPress={() => router.navigate('/spending')} />
        </Section>
        <PreviewFooter />
      </Screen>
    );
  }

  const top = sp.categories[0]?.share ?? 0;
  const investTop = sp.invested[0]?.share ?? 0;
  const investedTotal = sp.invested.reduce((sum, x) => sum + x.total, 0);
  const counted = sp.months === 1 ? 'one month' : `${sp.months} months`;
  return (
    <Screen title="Where It Went">
      {GROUPS.map((group) => {
        const list = sp.categories.filter((x) => x.category.group === group);
        if (!list.length) return null;
        const total = list.reduce((sum, x) => sum + x.total, 0);
        const share = list.reduce((sum, x) => sum + x.share, 0);
        return (
          <InsightCard
            key={group}
            label={groupTitle(group)}
            sentence={`${whole(Math.round(total / sp.months))} a month ${when}, ${formatPercent(share)} of your spending.`}>
            {list.map((x) => {
              const change = canCompare ? x.monthly - (lastYearMonthly.get(x.category.id) ?? 0) : null;
              return (
                <RankRow
                  key={x.category.id}
                  title={x.category.name}
                  value={`${whole(x.monthly)}/mo`}
                  share={x.share / top}
                  color={c.bar}
                  note={change == null ? formatPercent(x.share) : change === 0 ? 'Same' : signed(change)}
                  noteColor={change == null || change === 0 ? 'secondary' : change > 0 ? 'down' : 'up'}
                />
              );
            })}
          </InsightCard>
        );
      })}
      {sp.invested.length ? (
        <InsightCard
          label="Invested"
          sentence={`${whole(Math.round(investedTotal / sp.months))} a month ${when}, not counted as spending.`}>
          {sp.invested.map((x) => (
            <RankRow
              key={x.category.id}
              title={x.category.name}
              value={`${whole(x.monthly)}/mo`}
              share={x.share / investTop}
              color={c.invest}
              note={formatPercent(x.share)}
              noteColor="secondary"
            />
          ))}
        </InsightCard>
      ) : null}
      <Text variant="footnote" color="secondary" style={styles.footer}>
        {`Amounts are a month, on average over ${counted}.`}
        {canCompare
          ? ` Next to each bar is how much more or less you spent a month than in ${year - 1}.`
          : ' Next to each bar is its share of your spending.'}
      </Text>
      <PreviewFooter />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginHorizontal: layout.margin,
    marginTop: 8,
  },
});
