import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { Hero } from '@/components/hero';
import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { SampleBanner, SampleBody, SampleData } from '@/components/sample';
import { MonthsTable, type TableCell, type TableRow } from '@/components/months-table';
import { Screen } from '@/components/screen';
import { ShareRow } from '@/components/share-row';
import { Stepper } from '@/components/stepper';
import { useTabButtons } from '@/components/tab-buttons';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { currentMonthKey, MONTHS, MONTHS_SHORT, parseMonthKey } from '@/lib/dates';
import { formatPercent } from '@/lib/money';
import { categoryTotals, earnedTotals, savedCash, yearSummary } from '@/lib/spending';
import { useStore } from '@/store';
import { useSampleOn } from '@/store/sample-hidden';
import { layout, useColors } from '@/theme';


/** Until a first amount is entered, the page shows made-up sample spending (see the Net Worth tab). */
export default function SpendingTab() {
  const empty = useStore((s) => Object.values(s.spend).every((month) => Object.keys(month).length === 0));
  const sample = useSampleOn() && empty;
  return sample ? (
    <SampleData>
      <SpendingScreen sample />
    </SampleData>
  ) : (
    <SpendingScreen />
  );
}

function SpendingScreen({ sample }: { sample?: boolean }) {
  const c = useColors();
  const money = useMoney();
  const tabButtons = useTabButtons();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const now = parseMonthKey(currentMonthKey());
  const [pickedYear, setYear] = useState(now.year);
  // Up to this year, or further only if something was already entered for a later year:
  // an empty future year looks like lost data (say, after restoring a backup).
  const lastYear = Math.max(now.year, ...Object.keys(spend).map((k) => parseMonthKey(k).year));
  const year = Math.min(pickedYear, lastYear);
  const [selected, setSelected] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(false);

  const data = { spend, spendCategories };
  const summary = yearSummary(data, year);
  const earned = earnedTotals(summary.months);
  const withData = summary.months.filter((m) => m.hasData);
  const picked = selected != null ? summary.months[selected] : null;
  const hasIncome = summary.income > 0;
  const hasInvested = summary.invested > 0;
  const hasOver = summary.months.some((m) => m.income > 0 && m.expenses > m.income);
  const whole = (v: number) => money(v, { whole: true });

  const changeYear = (step: number) => {
    setYear(year + step);
    setSelected(null);
  };

  /**
   * "Earned $3,706 · Saved $1,262 (34.0%)", or with investing, "Earned $3,706 ·
   * Saved $1,062 · Invested $200", or how far spending went past income.
   */
  const incomeLine = (m: { income: number; net: number; invested: number }) => {
    const earnedText = `Earned ${whole(m.income)}`;
    const invested = m.invested > 0 ? ` · Invested ${whole(m.invested)}` : '';
    if (m.net < 0) return `${earnedText} · Over by ${whole(-m.net)}${invested}`;
    if (invested) return `${earnedText} · Saved ${whole(Math.max(0, savedCash(m)))}${invested}`;
    return `${earnedText} · Saved ${whole(m.net)} (${formatPercent(m.net / m.income)})`;
  };

  let caption: string;
  if (picked) {
    caption = !picked.hasData ? 'Nothing entered' : picked.income > 0 ? incomeLine(picked) : 'No income entered';
  } else if (!withData.length) {
    caption = 'Nothing entered yet';
  } else {
    // Only months with income count toward what was saved.
    caption = hasIncome ? incomeLine(earned) : `Average ${money(summary.avgExpenses)} a month`;
  }

  // Every month of the year. Ones still to come show lighter until something is entered.
  const isFuture = (i: number) => year > now.year || (year === now.year && i + 1 > now.month);
  const shown = summary.months.map((m, i) => ({ m, i }));

  const dash: TableCell = { text: '—', color: 'tertiary' };
  const signed = (v: number): TableCell => ({ text: whole(v), color: v > 0 ? 'up' : v < 0 ? 'down' : undefined });
  // Income first: what came in, then where it went (spent, saved, invested).
  const columns = [...(hasIncome ? ['Income'] : []), 'Spent', 'Saved', ...(hasInvested ? ['Invested'] : [])];
  const rows: TableRow[] = shown.map(({ m, i }) => {
    const saved = savedCash(m);
    return {
      key: m.key,
      name: MONTHS[i],
      muted: !m.hasData && isFuture(i),
      cells: m.hasData
        ? [
            ...(hasIncome ? [m.income > 0 ? { text: whole(m.income) } : dash] : []),
            { text: whole(m.expenses) },
            m.income > 0 ? signed(saved) : dash,
            ...(hasInvested ? [m.invested > 0 ? { text: whole(m.invested) } : dash] : []),
          ]
        : [...(hasIncome ? [null] : []), isFuture(i) ? null : dash, null, ...(hasInvested ? [null] : [])],
      onPress: () => router.push({ pathname: '/spending/[month]', params: { month: m.key } }),
      accessibilityLabel: m.hasData
        ? `${MONTHS[i]}: ${m.income > 0 ? `earned ${money(m.income)}, ` : ''}spent ${money(m.expenses)}${m.income > 0 ? `, saved ${money(saved)}` : ''}${m.invested > 0 ? `, invested ${money(m.invested)}` : ''}`
        : `${MONTHS[i]}: nothing entered`,
    };
  });
  const total: TableRow | undefined = withData.length
    ? {
        key: 'total',
        name: 'Total',
        cells: [
          ...(hasIncome ? [{ text: whole(summary.income) }] : []),
          { text: whole(summary.expenses) },
          hasIncome ? signed(savedCash(earned)) : dash,
          ...(hasInvested ? [{ text: whole(summary.invested) }] : []),
        ],
      }
    : undefined;

  const spendingTotals = categoryTotals(data, year, ['recurring', 'variable']);
  const investTotals = categoryTotals(data, year, ['invest']);
  const incomeTotals = categoryTotals(data, year, ['income']);

  // The sample can be scrolled but not tapped.
  const Body = sample ? SampleBody : Fragment;

  return (
    <Screen title="Spending" large left={tabButtons}>
      {sample ? (
        <SampleBanner
          action="Enter This Month"
          icon="plus"
          onAction={() => router.push({ pathname: '/spending/[month]', params: { month: currentMonthKey() } })}
        />
      ) : null}
      <Body>
        <Stepper
          label={String(year)}
          onPrev={() => changeYear(-1)}
          onNext={() => changeYear(1)}
          prevLabel="Previous year"
          nextLabel="Next year"
          canNext={year < lastYear}
        />
        <Hero
          label={picked ? `Spent in ${MONTHS[selected!]}` : `Spent in ${year}`}
          value={money(picked ? picked.expenses : summary.expenses)}
          caption={
            <Text variant="subheadline" color="secondary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {caption}
            </Text>
          }
        />
        <View style={styles.chart}>
          <BarChart
            bars={summary.months.map((m, i) => ({
              label: MONTHS_SHORT[i][0],
              value: m.expenses,
              total: m.income > 0 ? m.income : undefined,
              accessibilityLabel: m.hasData
                ? `${MONTHS[i]}: ${m.income > 0 ? `earned ${money(m.income)}, ` : ''}spent ${money(m.expenses)}${m.income > 0 ? `, earned ${money(m.income)}` : ''}`
                : `${MONTHS[i]}: nothing entered`,
            }))}
            selected={selected}
            onSelect={setSelected}
            formatTick={hidden ? undefined : (v) => money(v, { compact: true, whole: true })}
          />
        </View>
        {hasIncome ? (
          <View style={styles.legend}>
            <Key color={c.bar} label="Spent" />
            <Key color={c.barMuted} label={hasInvested ? 'Saved and invested' : 'Saved'} />
            {hasOver ? <Key color={c.down} label="Over income" /> : null}
          </View>
        ) : null}

        <MonthsTable title="Months" columns={columns} rows={rows} total={total} />

        {spendingTotals.length > 0 ? (
          <Section header={`Where it went in ${year}`}>
            {spendingTotals.map((t) => (
              <ShareRow key={t.category.id} title={t.category.name} value={money(t.total)} share={t.share} color={c.bar} />
            ))}
          </Section>
        ) : null}

        {investTotals.length > 0 ? (
          <Section header={`Invested in ${year}`}>
            {investTotals.map((t) => (
              <ShareRow key={t.category.id} title={t.category.name} value={money(t.total)} share={t.share} color={c.invest} />
            ))}
          </Section>
        ) : null}

        {incomeTotals.length > 0 ? (
          <Section header={`Income in ${year}`}>
            {incomeTotals.length > 1 ? (
              <Row
                title="Total"
                value={<Text tabular>{money(incomeTotals.reduce((sum, t) => sum + t.total, 0))}</Text>}
                chevron={false}
                accessory={
                  <Icon
                    name={showSources ? 'chevron.up' : 'chevron.down'}
                    size={13}
                    weight="semibold"
                    color={c.tertiary}
                  />
                }
                onPress={() => setShowSources(!showSources)}
                accessibilityLabel={showSources ? 'Hide income sources' : 'Show income sources'}
              />
            ) : null}
            {incomeTotals.length === 1 || showSources
              ? incomeTotals.map((t) => (
                  <ShareRow key={t.category.id} title={t.category.name} value={money(t.total)} share={t.share} color={c.up} />
                ))
              : null}
          </Section>
        ) : null}
      </Body>
    </Screen>
  );
}

/** A dot in a series' color and its name, like the legends under Swift Charts. */
function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="footnote" color="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    marginLeft: layout.margin,
    marginRight: layout.margin - 4,
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 4,
    marginTop: 10,
    marginHorizontal: layout.margin,
  },
  key: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
