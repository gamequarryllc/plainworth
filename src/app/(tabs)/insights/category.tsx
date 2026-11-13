import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { CategoryPills, categoryBars, categorySentence, useGroupColor, yearLabels } from '@/components/category-trend';
import { InsightCard } from '@/components/insight-card';
import { PreviewFooter, useInsightsPreview } from '@/components/insights-preview';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import {
  averageOf,
  categoryChange,
  categoryMonths,
  categoryYears,
  chartableCategories,
  recentCategoryMonths,
} from '@/lib/category-trend';
import { MONTHS } from '@/lib/dates';
import { MASK } from '@/lib/money';
import { useStore } from '@/store';

type Span = '1Y' | '2Y' | 'ALL';
const SPANS: { value: Span; label: string; months: number }[] = [
  { value: '1Y', label: '1Y', months: 12 },
  { value: '2Y', label: '2Y', months: 24 },
  { value: 'ALL', label: 'All', months: Infinity },
];

/**
 * Every month of one category, to see it creep: a year, two, or all of it as
 * bars, then a month on average for each year against the one before.
 */
export default function CategoryTrendScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const today = useToday();
  const locked = useInsightsPreview();
  const realMoney = useMoney();
  const money = (locked ? () => MASK : realMoney) as typeof realMoney;
  const groupColor = useGroupColor();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const [picked, setPicked] = useState(params.id ?? null);
  const [span, setSpan] = useState<Span>('1Y');
  const [at, setAt] = useState<number | null>(null);
  const whole = (cents: number) => money(cents, { whole: true });

  const data = { spend, spendCategories };
  const categories = chartableCategories(data, today);
  const category = categories.find((x) => x.id === picked) ?? categories[0];
  if (!category) {
    return (
      <Screen title="By Category">
        <Section footer="Nothing entered in Spending yet." />
        <PreviewFooter />
      </Screen>
    );
  }

  const all = categoryMonths(data, category.id, today);
  // Only the spans that show more than the one before.
  const spans = SPANS.filter((s, i) => i === 0 || all.length > SPANS[i - 1].months);
  const shown = spans.find((s) => s.value === span) ?? spans[0];
  const months = shown.value === 'ALL' && all.length > 12 ? all : recentCategoryMonths(data, category.id, today, shown.months);
  const average = averageOf(months);
  const change = categoryChange(all);
  const years = categoryYears(all).reverse();
  const color = groupColor(category.group);
  const selected = at != null ? months[at] : null;
  const verb = category.group === 'income' ? 'Earned' : 'Spent';
  // Spending more is the bad direction; earning more is the good one.
  const moreIsGood = category.group === 'income';

  const pick = (id: string) => {
    setPicked(id);
    setAt(null);
  };
  const changeSpan = (s: Span) => {
    setSpan(s);
    setAt(null);
  };

  return (
    <Screen title={category.name}>
      <InsightCard
        label={verb === 'Spent' ? 'Month by Month' : `${verb}, Month by Month`}
        sentence={
          locked
            ? `See how ${category.name} changes month to month.`
            : categorySentence(category.name, all, change, averageOf(all), whole)
        }
        note={
          category.hidden
            ? `You stopped tracking ${category.name}. Its months stay here.`
            : 'Lately means your last three months. Counts each month once it’s over.'
        }>
        <CategoryPills categories={categories} value={category.id} onChange={pick} />
        {spans.length > 1 ? (
          <Segmented options={spans} value={shown.value} onChange={changeSpan} style={styles.spans} />
        ) : null}
        <View style={styles.readout}>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {selected ? `${MONTHS[selected.month - 1]} ${selected.year}` : 'A month on average'}
          </Text>
          <Text variant="title2" weight="700" rounded tabular numberOfLines={1}>
            {selected
              ? selected.value == null
                ? 'Nothing entered'
                : whole(selected.value)
              : average != null
                ? whole(average)
                : '—'}
          </Text>
        </View>
        <BarChart
          bars={categoryBars(months, money)}
          color={color}
          average={average}
          selected={at}
          onSelect={locked ? undefined : setAt}
          formatTick={hidden || locked ? undefined : (v) => money(v, { compact: true, whole: true })}
          axisLabels={months.length > 12 ? yearLabels(months) : undefined}
          height={170}
        />
      </InsightCard>
      {years.length ? (
        <Section header="Each Year" footer="A month on average, over the months entered, against the year before.">
          {years.map((y) => (
            <Row
              key={y.year}
              title={String(y.year)}
              subtitle={y.months < 12 ? `${y.months} ${y.months === 1 ? 'month' : 'months'}` : undefined}
              value={
                <Text variant="body" tabular numberOfLines={1}>
                  {y.change == null ? null : (
                    <Text
                      variant="subheadline"
                      tabular
                      color={
                        locked || Math.round(y.change * 100) === 0
                          ? 'secondary'
                          : y.change > 0 === moreIsGood
                            ? 'up'
                            : 'down'
                      }>
                      {locked ? '••%   ' : `${y.change < 0 ? '−' : '+'}${Math.round(Math.abs(y.change) * 100)}%   `}
                    </Text>
                  )}
                  {`${whole(y.monthly)}/mo`}
                </Text>
              }
            />
          ))}
        </Section>
      ) : null}
      <PreviewFooter />
    </Screen>
  );
}

const styles = StyleSheet.create({
  spans: {
    marginBottom: 12,
  },
  readout: {
    marginBottom: 8,
  },
});
