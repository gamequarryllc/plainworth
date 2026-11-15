import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IncomeSources } from '@/components/income-sources';
import { InsightCard, RankRow } from '@/components/insight-card';
import { PreviewFooter, useInsightsPreview } from '@/components/insights-preview';
import { Row, Section } from '@/components/list';
import { YearPills } from '@/components/pills';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { parseDateKey } from '@/lib/dates';
import { monthsLabel, recentMonths, shownYear, spendingMonths, spendingYear, spendingYears } from '@/lib/insights';
import { formatPercent, roundsToZero } from '@/lib/money';
import { categoryTotals, groupTitle } from '@/lib/spending';
import type { SpendGroup } from '@/lib/types';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';

const GROUPS: SpendGroup[] = ['recurring', 'variable'];

/**
 * Every spending category for a year (or the preview's two months), a month
 * on average, by group, then what the year's income was made of. It opens on
 * the year the card was showing, and a row of years at the top shows any other.
 */
export default function WhereItWentScreen() {
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const preview = useInsightsPreview();
  const params = useLocalSearchParams<{ year?: string }>();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const now = parseDateKey(today);
  const data = { spend, spendCategories };
  const years = preview ? [] : spendingYears(data, today);
  const [picked, setPicked] = useState<number | null>(Number(params.year) || null);
  const year = shownYear(years, picked, now.y);
  const whole = (cents: number) => money(cents, { whole: true });
  const signed = (cents: number) => money(cents, { signed: true, whole: true });

  const months = preview ? recentMonths(today) : null;
  const sp = months ? spendingMonths(data, months) : spendingYear(data, year, today);
  const spBefore = months ? null : spendingYear(data, year - 1, today);
  const canCompare = !!sp && !!spBefore && sp.months >= 2 && spBefore.months >= 2;
  const lastYearMonthly = new Map(spBefore?.categories.map((x) => [x.category.id, x.monthly]) ?? []);
  const when = months ? `in ${monthsLabel(months)}` : year === now.y ? 'this year' : `in ${year}`;

  if (!sp || !sp.categories.length) {
    return (
      <Screen title="Where It Went">
        <Section footer={`Nothing spent in ${months ? monthsLabel(months) : year}${months || year === now.y ? ' yet' : ''}.`}>
          <Row title="Open Spending" titleColor="tint" chevron={false} onPress={() => router.navigate('/spending')} />
        </Section>
        <PreviewFooter />
      </Screen>
    );
  }

  const openCategory = (id: string) => router.push({ pathname: '/insights/category', params: { id } });
  const top = sp.categories[0]?.share ?? 0;
  const counted = sp.months === 1 ? 'one month' : `${sp.months} months`;
  return (
    <Screen title="Where It Went">
      {years.length > 1 ? (
        <View style={styles.years}>
          <YearPills years={years} value={year} onChange={setPicked} style={styles.pills} />
        </View>
      ) : null}
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
              // Under 50 cents either way shows as $0, so it's the same: no sign, no color.
              const same = change != null && roundsToZero(change);
              return (
                <RankRow
                  key={x.category.id}
                  title={x.category.name}
                  value={`${whole(x.monthly)}/mo`}
                  share={x.share / top}
                  color={c.bar}
                  note={change == null ? formatPercent(x.share) : same ? `Same as ${year - 1}` : `${signed(change)} vs ${year - 1}`}
                  noteColor={change == null || same ? 'secondary' : change > 0 ? 'down' : 'up'}
                  onPress={preview ? undefined : () => openCategory(x.category.id)}
                />
              );
            })}
          </InsightCard>
        );
      })}
      <Text variant="footnote" color="secondary" style={styles.footer}>
        {`Amounts are a month, on average over ${counted}.${preview ? '' : ' Tap one to see it month by month.'}`}
        {canCompare
          ? ` Under each is how much more or less that is a month than in ${year - 1}.`
          : ' Next to each bar is its share of your spending.'}
      </Text>
      {preview ? null : (
        <IncomeSources
          totals={categoryTotals(data, year, ['income'])}
          when={year === now.y ? 'this year' : `in ${year}`}
          money={money}
        />
      )}
      <PreviewFooter />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The row scrolls edge to edge, with the first pill lined up with the cards' text.
  years: {
    marginHorizontal: layout.margin,
    marginTop: 12,
  },
  pills: {
    marginBottom: 0,
  },
  footer: {
    marginHorizontal: layout.margin,
    marginTop: 8,
  },
});
