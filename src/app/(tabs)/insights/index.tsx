import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { InsightCard, RankRow } from '@/components/insight-card';
import { PreviewFooter, useInsightsPreview } from '@/components/insights-preview';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { useTabButtons } from '@/components/tab-buttons';
import { Text } from '@/components/text';
import { TrendChart, TrendKey, type TrendLabel } from '@/components/trend-chart';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { MONTHS, MONTHS_SHORT, parseDateKey } from '@/lib/dates';
import { firstYear, spendingYear, type Month } from '@/lib/insights';
import { formatPercent } from '@/lib/money';
import {
  growthStreaks,
  lifestyleCreep,
  monthsUntil,
  netWorthHistory,
  netWorthPace,
  netWorthSoFar,
  nextMilestone,
  shift,
  spendHistory,
  spendStreaks,
  spentSoFar,
  type Creep,
  type GrowthStreaks,
  type NetWorthMonth,
  type SpendStreaks,
} from '@/lib/trends';
import { useStore } from '@/store';
import { useColors } from '@/theme';

type Part = 'networth' | 'spending';
const PARTS: { value: Part; label: string }[] = [
  { value: 'networth', label: 'Net Worth' },
  { value: 'spending', label: 'Spending' },
];

/**
 * Progress over time, chart first: where net worth is headed, this year
 * against last, streaks and lifestyle creep. Net Worth and Spending are one tap
 * apart and never mixed, so neither is thrown off by how much of the other
 * tracker is filled in. As a preview, each shows only its first card.
 */
export default function InsightsScreen() {
  const tabButtons = useTabButtons();
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const [part, setPart] = useState<Part>('networth');

  if (firstYear({ snapshots, spend }) == null) {
    return (
      <Screen title="Insights" large left={tabButtons}>
        <EmptyState
          icon="chart.pie"
          title="See the bigger picture"
          message="Once you’ve added accounts or entered a month of spending, this page shows where your net worth is headed and how your spending changes over time."
        />
        <PreviewFooter />
      </Screen>
    );
  }

  return (
    <Screen title="Insights" large left={tabButtons}>
      <Segmented options={PARTS} value={part} onChange={setPart} style={styles.parts} />
      {part === 'networth' ? <NetWorth /> : <Spending />}
      <PreviewFooter />
    </Screen>
  );
}

/** The cards that have something to say; just the first one in the preview. */
function useCards(cards: (ReactElement | null)[]): ReactElement[] {
  const preview = useInsightsPreview();
  const shown = cards.filter((x): x is ReactElement => x != null);
  return preview ? shown.slice(0, 1) : shown;
}

const shortMonth = (m: Month) => `${MONTHS_SHORT[m.month - 1]} ${m.year}`;
const lastIndex = (values: (number | null)[]) => values.reduce<number>((last, v, i) => (v != null ? i : last), -1);
const MONTH_LABELS: TrendLabel[] = MONTHS_SHORT.map((m, i) => ({ index: i, text: m[0] }));

function NetWorth() {
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const year = parseDateKey(today).y;

  const history = netWorthHistory({ accounts, snapshots, nwCategories }, today);
  const pace = netWorthPace(history);
  const soFar = netWorthSoFar(history, year);
  const streaks = growthStreaks(history, today);
  const cards = useCards([
    pace ? <HeadedCard key="headed" history={history} perMonth={pace.perMonth} counted={pace.months} /> : null,
    lastIndex(soFar) >= 0 && history.length >= 2 ? (
      <NetWorthYearCard key="year" year={year} soFar={soFar} before={netWorthSoFar(history, year - 1)} />
    ) : null,
    streaks.recent.length >= 2 ? <GrowthStreaksCard key="streaks" streaks={streaks} /> : null,
  ]);

  if (!history.length) {
    return (
      <Section footer="No balances entered yet.">
        {accounts.length === 0 ? (
          <Row title="Add an Account" titleColor="tint" chevron={false} onPress={() => router.push('/account-form')} />
        ) : null}
      </Section>
    );
  }
  if (!cards.length) {
    return (
      <InsightCard
        label="Where You’re Headed"
        sentence="Update your balances over the next couple of months to see where your net worth is headed."
      />
    );
  }
  return <>{cards}</>;
}

type Horizon = '12' | '36' | '60' | '120';
const HORIZONS: { value: Horizon; label: string }[] = [
  { value: '12', label: '1Y' },
  { value: '36', label: '3Y' },
  { value: '60', label: '5Y' },
  { value: '120', label: '10Y' },
];

/** Net worth so far, then a dotted line ahead at the current pace, like a forecast. */
function HeadedCard({ history, perMonth, counted }: { history: NetWorthMonth[]; perMonth: number; counted: number }) {
  const c = useColors();
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const [horizon, setHorizon] = useState<Horizon>('60');
  const ahead = Number(horizon);
  const years = ahead / 12;
  const inYears = years === 1 ? 'in a year' : `in ${years} years`;

  const now = history[history.length - 1];
  const current = now.end;
  const projected = current + perMonth * ahead;
  const milestone = nextMilestone(current);
  const away = monthsUntil(current, milestone, perMonth);

  // As much history as the projection is long, so the chart stays balanced.
  const shown = history.slice(-Math.min(ahead, history.length));
  const nowIndex = shown.length - 1;
  const count = nowIndex + ahead + 1;
  const actual = [...shown.map((m) => m.end), ...Array(ahead).fill(null)];
  const forecast = Array.from({ length: count }, (_, i) => (i < nowIndex ? null : current + perMonth * (i - nowIndex)));
  const end = shift(now, ahead);
  const labels: TrendLabel[] = [
    ...(nowIndex > 0 ? [{ index: 0, text: shortMonth(shown[0]) }] : []),
    { index: nowIndex, text: 'Today' },
    { index: count - 1, text: shortMonth(end) },
  ];

  let sentence: string;
  if (perMonth > 0) {
    sentence =
      away != null && away <= 600
        ? `At about ${whole(perMonth)} a month, you’d ${milestone === 0 ? 'be back above zero' : `pass ${whole(milestone)}`} around ${MONTHS[shift(now, away).month - 1]} ${shift(now, away).year}.`
        : `At about ${whole(perMonth)} a month, you’d have ${whole(projected)} ${inYears}.`;
  } else if (perMonth < 0) {
    sentence = `Your net worth has fallen about ${whole(-perMonth)} a month lately. At that pace it would be ${whole(projected)} ${inYears}.`;
  } else {
    sentence = 'Your net worth has held steady lately.';
  }

  return (
    <InsightCard
      label="Where You’re Headed"
      sentence={sentence}
      note={`Your pace is the average monthly change over the last ${counted} months. It assumes nothing changes, so it’s a direction, not a promise.`}>
      <Segmented options={HORIZONS} value={horizon} onChange={setHorizon} style={styles.horizon} />
      <View style={styles.bigRow}>
        <Text variant="title2" weight="700" rounded tabular numberOfLines={1}>
          {whole(projected)}
        </Text>
        <Text variant="subheadline" color="secondary">
          {` ${inYears}`}
        </Text>
      </View>
      <TrendKey
        items={[
          { label: 'Your net worth', color: c.up },
          { label: 'At your pace', color: c.up, dashed: true },
          ...(away != null && away <= ahead ? [{ label: whole(milestone), color: c.warning }] : []),
        ]}
      />
      <TrendChart
        count={count}
        height={130}
        series={[
          { values: actual, color: c.up, endDot: true },
          { values: forecast, color: c.up, dashed: true },
        ]}
        marker={away != null && away <= ahead ? { index: nowIndex + away, value: milestone, color: c.warning } : null}
        labels={labels}
      />
    </InsightCard>
  );
}

/** Growth since January 1, this year against last, month by month. */
function NetWorthYearCard({ year, soFar, before }: { year: number; soFar: (number | null)[]; before: (number | null)[] }) {
  const c = useColors();
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const last = lastIndex(soFar);
  const value = soFar[last]!;
  const then = before[last];
  const hasBefore = lastIndex(before) >= 0;

  let sentence = value >= 0 ? `Your net worth is up ${whole(value)} this year` : `Your net worth is down ${whole(-value)} this year`;
  if (then != null) {
    const diff = value - then;
    sentence +=
      Math.abs(diff) <= Math.max(Math.abs(then) * 0.03, 100)
        ? ', about the same as at this point last year.'
        : `, ${whole(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than at this point last year.`;
  } else {
    sentence += '.';
  }

  return (
    <InsightCard label="This Year vs Last Year" sentence={sentence} note="How much your net worth has grown since January 1.">
      {hasBefore ? (
        <TrendKey
          items={[
            { label: String(year), color: c.up },
            { label: String(year - 1), color: c.tertiary },
          ]}
        />
      ) : null}
      <TrendChart
        count={12}
        zero
        series={[
          { values: before, color: c.tertiary },
          { values: soFar, color: c.up, endDot: true },
        ]}
        labels={MONTH_LABELS}
      />
    </InsightCard>
  );
}

function GrowthStreaksCard({ streaks }: { streaks: GrowthStreaks }) {
  const { current, best, highsThisYear, recent } = streaks;
  const up = recent.filter((m) => m.up).length;
  let sentence: string;
  if (current >= 2) {
    sentence = `${current} months in a row of growth. ${best > current ? `Your best run is ${best}.` : 'That’s your best run yet.'}`;
  } else if (current === 1) {
    sentence = `Your net worth grew last month.${best > 1 ? ` Your best run is ${best} months.` : ''}`;
  } else {
    sentence = best > 0 ? `Your net worth dipped last month. Your best run of growth is ${months(best)}.` : 'Your net worth hasn’t had a month of growth yet.';
  }
  return (
    <InsightCard label="Streaks" sentence={sentence}>
      <MonthDots months={recent} />
      <StatGrid
        stats={[
          { value: months(current, true), label: 'Growth streak' },
          { value: months(best, true), label: 'Best streak' },
          { value: String(highsThisYear), label: highsThisYear === 1 ? 'New high this year' : 'New highs this year' },
          { value: `${up} of ${recent.length}`, label: 'Months up lately' },
        ]}
      />
    </InsightCard>
  );
}

const months = (n: number, short?: boolean) => (short ? `${n} mo` : n === 1 ? '1 month' : `${n} months`);

function Spending() {
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const year = parseDateKey(today).y;
  const data = { spend, spendCategories };

  const soFar = spentSoFar(data, year, today);
  const creep = lifestyleCreep(data, today);
  const history = spendHistory(data, today);
  const streaks = spendStreaks(history, today);
  const sp = spendingYear(data, year, today);
  const cards = useCards([
    lastIndex(soFar) >= 0 ? (
      <SpentYearCard key="year" year={year} soFar={soFar} before={spentSoFar(data, year - 1, today)} />
    ) : null,
    creep ? <CreepCard key="creep" creep={creep} /> : null,
    history.length >= 2 ? <SpendStreaksCard key="streaks" streaks={streaks} /> : null,
    sp?.categories.length ? <WhereItWentCard key="where" year={year} /> : null,
  ]);

  if (!sp && !history.length) {
    return (
      <Section footer="Nothing entered in Spending yet.">
        <Row title="Open Spending" titleColor="tint" chevron={false} onPress={() => router.navigate('/spending')} />
      </Section>
    );
  }
  if (!cards.length) {
    return (
      <InsightCard
        label="This Year vs Last Year"
        sentence="Once a month you’ve entered is over, this page shows how your spending adds up over the year."
      />
    );
  }
  return <>{cards}</>;
}

/** Spending added up since January, this year against last. */
function SpentYearCard({ year, soFar, before }: { year: number; soFar: (number | null)[]; before: (number | null)[] }) {
  const c = useColors();
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const last = lastIndex(soFar);
  const value = soFar[last]!;
  const then = before[last];
  const hasBefore = lastIndex(before) >= 0;

  let sentence = `You’ve spent ${whole(value)} this year through ${MONTHS[last]}`;
  if (then != null) {
    const diff = value - then;
    sentence +=
      Math.abs(diff) <= then * 0.03
        ? ', about the same as by then last year.'
        : `, ${whole(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than by then last year.`;
  } else {
    sentence += '.';
  }

  return (
    <InsightCard label="This Year vs Last Year" sentence={sentence} note="Counts each month once it’s over.">
      {hasBefore ? (
        <TrendKey
          items={[
            { label: `${year}, added up`, color: c.bar },
            { label: `${year - 1}, added up`, color: c.tertiary },
          ]}
        />
      ) : null}
      <TrendChart
        count={12}
        series={[
          { values: before, color: c.tertiary },
          { values: soFar, color: c.bar, endDot: true },
        ]}
        labels={MONTH_LABELS}
      />
    </InsightCard>
  );
}

/** Income and spending, each as a change from where it started: spending climbing faster is creep. */
function CreepCard({ creep }: { creep: Creep }) {
  const c = useColors();
  const { income, spending, year } = creep;
  const moved = (r: number) =>
    Math.round(Math.abs(r) * 100) === 0 ? 'held steady' : `${r >= 0 ? 'grew' : 'fell'} ${Math.round(Math.abs(r) * 100)}%`;
  let sentence: string;
  if (income == null) {
    sentence = `Your spending ${moved(spending)} this year, month for month.`;
  } else {
    sentence = `Your income ${moved(income)} this year and your spending ${moved(spending)}.`;
    if (spending > income + 0.01) sentence += ' That’s lifestyle creep.';
    else if (income > spending + 0.01) sentence += ' You’re keeping the difference.';
    else sentence += ' They’re moving together.';
  }
  const count = creep.months.length;
  const labels: TrendLabel[] = [
    { index: 0, text: shortMonth(creep.months[0]) },
    ...(count > 14 ? [{ index: 12, text: shortMonth(creep.months[12]) }] : []),
    { index: count - 1, text: shortMonth(creep.months[count - 1]) },
  ];
  return (
    <InsightCard
      label="Lifestyle Creep"
      sentence={sentence}
      note={`Compares your average month in ${year} with ${year - 1}. Each line is a six-month average, as a change from where it started. When the blue line climbs faster than the green one, that’s creep.`}>
      <TrendKey
        items={[
          ...(income != null ? [{ label: 'Income', color: c.up }] : []),
          { label: 'Spending', color: c.bar },
        ]}
      />
      <TrendChart
        count={count}
        zero
        series={[
          { values: creep.incomeLine, color: c.up, endDot: true },
          { values: creep.spendingLine, color: c.bar, endDot: true },
        ]}
        labels={labels}
      />
    </InsightCard>
  );
}

function SpendStreaksCard({ streaks }: { streaks: SpendStreaks }) {
  const { keeping, bestKeeping, underAverage, investing, recent } = streaks;
  let sentence: string;
  if (keeping >= 2) sentence = `${keeping} months in a row keeping at least 20% of what you earned.`;
  else if (keeping === 1) sentence = 'You kept at least 20% of what you earned last month.';
  else if (bestKeeping > 0) sentence = `Your best run keeping 20% or more is ${months(bestKeeping)}.`;
  else if (investing >= 2) sentence = `${investing} months in a row investing.`;
  else sentence = 'Keep 20% of what you earn in a month to start a streak.';
  return (
    <InsightCard label="Streaks" sentence={sentence} note="A green dot is a month you kept 20% or more.">
      <MonthDots months={recent} />
      <StatGrid
        stats={[
          { value: months(keeping, true), label: 'Keeping 20% or more' },
          { value: months(underAverage, true), label: 'Under your average' },
          { value: months(investing, true), label: 'Investing every month' },
          { value: months(bestKeeping, true), label: 'Best 20% streak' },
        ]}
      />
    </InsightCard>
  );
}

/** The year's biggest spending categories, with the full list a tap away. */
function WhereItWentCard({ year }: { year: number }) {
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const whole = (cents: number) => money(cents, { whole: true });
  const signed = (cents: number) => money(cents, { signed: true, whole: true });
  const data = { spend, spendCategories };
  const sp = spendingYear(data, year, today)!;
  const spBefore = spendingYear(data, year - 1, today);
  const canCompare = !!spBefore && sp.months >= 2 && spBefore.months >= 2;
  const lastYearMonthly = new Map(spBefore?.categories.map((x) => [x.category.id, x.monthly]) ?? []);
  const top = sp.categories[0];
  return (
    <InsightCard
      label="Where It Went"
      sentence={`${top.category.name} took the biggest share of your spending this year, ${formatPercent(top.share)}.`}
      note={canCompare ? `Next to each bar is how much more or less you spent a month than in ${year - 1}.` : null}
      onPress={() => router.push({ pathname: '/insights/where-it-went', params: { year: String(year) } })}>
      {sp.categories.slice(0, 5).map((x) => {
        const change = canCompare ? x.monthly - (lastYearMonthly.get(x.category.id) ?? 0) : null;
        return (
          <RankRow
            key={x.category.id}
            title={x.category.name}
            value={`${whole(x.monthly)}/mo`}
            share={x.share / top.share}
            color={c.bar}
            note={change == null ? formatPercent(x.share) : change === 0 ? 'Same' : signed(change)}
            // Spending more is the bad direction.
            noteColor={change == null || change === 0 ? 'secondary' : change > 0 ? 'down' : 'up'}
          />
        );
      })}
    </InsightCard>
  );
}

/** A dot per month, filled when it counts, like Fitness's streak rows. */
function MonthDots({ months: list }: { months: (Month & { up: boolean })[] }) {
  const c = useColors();
  return (
    <View style={styles.dots}>
      {list.map((m) => (
        <View
          key={`${m.year}-${m.month}`}
          style={styles.dotCol}
          accessible
          accessibilityLabel={`${MONTHS[m.month - 1]} ${m.year}: ${m.up ? 'yes' : 'no'}`}>
          <View style={[styles.dot, { backgroundColor: m.up ? c.up : c.fill }]} />
          <Text variant="caption" color="secondary">
            {MONTHS_SHORT[m.month - 1][0]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Four small figures in two rows. */
function StatGrid({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <View style={styles.grid}>
      {stats.map((s) => (
        <View key={s.label} style={styles.stat}>
          <Text variant="title3" weight="700" rounded tabular>
            {s.value}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  parts: {
    marginTop: 4,
    marginBottom: 10,
  },
  horizon: {
    marginHorizontal: 0,
    marginBottom: 12,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dotCol: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  stat: {
    width: '50%',
  },
});
