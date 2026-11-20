import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { Hero } from '@/components/hero';
import { SampleBanner, SampleData, startSpending, useSpendingSample } from '@/components/sample';
import { MonthsTable, type TableCell, type TableRow } from '@/components/months-table';
import { Screen } from '@/components/screen';
import { Stepper } from '@/components/stepper';
import { useTabButtons } from '@/components/tab-buttons';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { currentMonthKey, MONTHS, MONTHS_SHORT, parseMonthKey } from '@/lib/dates';
import { fitMoney, formatPercent, MASK, roundsToZero } from '@/lib/money';
import { earnedTotals, yearSummary } from '@/lib/spending';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';


/** Until a first amount is entered, the page shows made-up sample spending (see the Net Worth tab). */
export default function SpendingTab() {
  const sample = useSpendingSample();
  return sample ? (
    <SampleData start={startSpending}>
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
  const currency = useStore((s) => s.settings.currency);
  const now = parseMonthKey(currentMonthKey());
  const [pickedYear, setYear] = useState(now.year);
  // Up to this year, or further only if something was already entered for a later year:
  // an empty future year looks like lost data (say, after restoring a backup).
  const lastYear = Math.max(now.year, ...Object.keys(spend).map((k) => parseMonthKey(k).year));
  const year = Math.min(pickedYear, lastYear);
  const [selected, setSelected] = useState<number | null>(null);

  const data = { spend, spendCategories };
  const summary = yearSummary(data, year);
  const earned = earnedTotals(summary.months);
  const withData = summary.months.filter((m) => m.hasData);
  const picked = selected != null ? summary.months[selected] : null;
  const hasIncome = summary.income > 0;
  const hasOver = summary.months.some((m) => m.income > 0 && m.expenses > m.income);
  const whole = (v: number) => money(v, { whole: true });

  const changeYear = (step: number) => {
    setYear(year + step);
    setSelected(null);
  };

  /** "Earned $3,706 · Saved $1,262 (34.0%)", or how far spending went past income. */
  const incomeLine = (m: { income: number; net: number }) => {
    const earnedText = `Earned ${whole(m.income)}`;
    if (m.net < 0) return `${earnedText} · Over by ${whole(-m.net)}`;
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
  // The columns are narrow: an amount in the millions is shortened ("$1.47M") instead of being cut off.
  const cell = (v: number) => (hidden ? MASK : fitMoney(v, currency, 9));
  // A few cents either way shows as $0, with no color.
  const signed = (v: number): TableCell => ({
    text: cell(v),
    color: roundsToZero(v) ? undefined : v > 0 ? 'up' : 'down',
  });
  // Income first: what came in, then where it went (spent, saved).
  const columns = [...(hasIncome ? ['Income'] : []), 'Spent', 'Saved'];
  const rows: TableRow[] = shown.map(({ m, i }) => {
    const saved = m.net;
    return {
      key: m.key,
      name: MONTHS[i],
      muted: !m.hasData && isFuture(i),
      cells: m.hasData
        ? [
            ...(hasIncome ? [m.income > 0 ? { text: cell(m.income) } : dash] : []),
            { text: cell(m.expenses) },
            m.income > 0 ? signed(saved) : dash,
          ]
        : [...(hasIncome ? [null] : []), isFuture(i) ? null : dash, null],
      onPress: () => router.push({ pathname: '/spending/[month]', params: { month: m.key } }),
      accessibilityLabel: m.hasData
        ? `${MONTHS[i]}: ${m.income > 0 ? `earned ${money(m.income)}, ` : ''}spent ${money(m.expenses)}${m.income > 0 ? `, saved ${money(saved)}` : ''}`
        : `${MONTHS[i]}: nothing entered`,
    };
  });
  const total: TableRow | undefined = withData.length
    ? {
        key: 'total',
        name: 'Total',
        cells: [
          ...(hasIncome ? [{ text: cell(summary.income) }] : []),
          { text: cell(summary.expenses) },
          hasIncome ? signed(earned.net) : dash,
        ],
      }
    : undefined;



  return (
    <Screen title="Spending" large left={tabButtons}>
      {sample ? (
        <SampleBanner
          action="Enter This Month"
          icon="plus"
          onAction={startSpending}
        />
      ) : null}
      <>
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
            <Key color={c.barMuted} label="Saved" />
            {hasOver ? <Key color={c.down} label="Over income" /> : null}
          </View>
        ) : null}

        <MonthsTable title="Months" columns={columns} rows={rows} total={total} />

      </>
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
