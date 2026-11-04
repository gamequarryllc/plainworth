import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { CategoryPills, categoryBars, categorySentence, useGroupColor, yearLabels } from '@/components/category-trend';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { InsightCard, RankRow } from '@/components/insight-card';
import { PreviewFooter, useInsightsPreview } from '@/components/insights-preview';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { StackedBars, useCategoryColors } from '@/components/stacked-bars';
import { useTabButtons } from '@/components/tab-buttons';
import { Text } from '@/components/text';
import { TrendChart, TrendKey, type TrendLabel } from '@/components/trend-chart';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { averageOf, categoryChange, chartableCategories, recentCategoryMonths } from '@/lib/category-trend';
import { MONTHS, MONTHS_SHORT, parseDateKey } from '@/lib/dates';
import { firstYear, spendingYear, type Month } from '@/lib/insights';
import { formatPercent, MASK } from '@/lib/money';
import { goalStatus, goalYear, makePlan, MAX_MONTHS, monthlyRate, monthsToReach, project, ratePercent } from '@/lib/outlook';
import {
  compareYears,
  creepMonths,
  distribution,
  lifestyleCreep,
  netWorthHistory,
  netWorthPace,
  netWorthSoFar,
  nextMilestone,
  shift,
  spendHistory,
  spentSoFar,
  yearGoals,
  type CreepMonth,
  type NetWorthMonth,
  type PeriodUnit,
  type YearGoals,
} from '@/lib/trends';
import type { SpendCategory, SpendingGoal } from '@/lib/types';
import { useStore } from '@/store';
import { openPaywall } from '@/store/pro';
import { useColors } from '@/theme';

type Part = 'networth' | 'spending';
const PARTS: { value: Part; label: string }[] = [
  { value: 'networth', label: 'Net Worth' },
  { value: 'spending', label: 'Spending' },
];

/**
 * Progress over time, chart first: where net worth is headed, this year
 * against last, and lifestyle creep. Net Worth and Spending are one tap
 * apart and never mixed, so neither is thrown off by how much of the other
 * tracker is filled in. As a preview, every card shows its chart's shape
 * with the numbers and answers hidden, and opens Pro when tapped.
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

/** The cards that have something to say. */
function useCards(cards: (ReactElement | null)[]): ReactElement[] {
  return cards.filter((x): x is ReactElement => x != null);
}

/**
 * For a card in the Pro preview: amounts come out masked, the card opens Pro
 * when tapped, and its sentence is a teaser instead of the answer.
 */
function useLock() {
  const locked = useInsightsPreview();
  const money = useMoney();
  return {
    locked,
    money: (locked ? () => MASK : money) as typeof money,
    card: locked ? { locked: true, onPress: () => openPaywall('insights') } : {},
    text: (answer: string, teaser: string) => (locked ? teaser : answer),
  };
}

const shortMonth = (m: Month) => `${MONTHS_SHORT[m.month - 1]} ${m.year}`;
const lastIndex = (values: (number | null)[]) => values.reduce<number>((last, v, i) => (v != null ? i : last), -1);
const MONTH_LABELS: TrendLabel[] = MONTHS_SHORT.map((m, i) => ({ index: i, text: m[0] }));
const wholePercent = (r: number) => `${Math.round(r * 100)}%`;

function NetWorth() {
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const year = parseDateKey(today).y;

  const monthly = useStore((s) => s.settings.outlook.monthly);

  const history = netWorthHistory({ accounts, snapshots, nwCategories }, today);
  const pace = netWorthPace(history);
  const soFar = netWorthSoFar(history, year);
  const cards = useCards([
    history.length && (pace || monthly != null) ? (
      <HeadedCard key="headed" history={history} pace={pace?.perMonth ?? null} counted={pace?.months ?? 0} />
    ) : null,
    lastIndex(soFar) >= 0 && history.length >= 2 ? (
      <NetWorthYearCard key="year" year={year} soFar={soFar} lastYear={netWorthSoFar(history, year - 1)} />
    ) : null,
    history.length >= 2 ? <DistributionCard key="mix" /> : null,
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

const UNITS: { value: PeriodUnit; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year', label: 'Yearly' },
];

const periodLabel = (p: Month & { unit: PeriodUnit }) =>
  p.unit === 'month'
    ? MONTHS_SHORT[p.month - 1]
    : p.unit === 'quarter'
      ? `Q${p.month / 3} ’${String(p.year).slice(2)}`
      : String(p.year);
const periodName = (p: Month & { unit: PeriodUnit }) =>
  p.unit === 'month' ? `${MONTHS[p.month - 1]} ${p.year}` : p.unit === 'quarter' ? `Q${p.month / 3} ${p.year}` : String(p.year);

/** What your assets are made of, period by period, as stacked columns. Tap one for its breakdown. */
function DistributionCard() {
  const lock = useLock();
  const money = lock.money;
  const colors = useCategoryColors();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const [unit, setUnit] = useState<PeriodUnit>('month');
  const [picked, setPicked] = useState<number | null>(null);
  const d = distribution({ accounts, snapshots, nwCategories }, today, unit);
  if (d.periods.length === 0 || d.categories.length === 0) return null;
  const last = d.periods.length - 1;
  const at = picked != null && picked <= last ? picked : last;
  const totalAt = (i: number) => d.values[i].reduce((s, v) => s + v, 0);
  const shareAt = (i: number, k: number) => (totalAt(i) > 0 ? d.values[i][k] / totalAt(i) : 0);
  const top = d.categories[0];

  let sentence = `${top.name} ${d.categories.length > 1 ? `makes up ${formatPercent(shareAt(last, 0))} of` : 'is all of'} what you own.`;
  if (last > 0 && d.categories.length > 1) {
    const then = shareAt(0, 0);
    const now = shareAt(last, 0);
    const since = periodName(d.periods[0]);
    if (Math.abs(now - then) >= 0.02) {
      sentence = `${top.name} makes up ${formatPercent(now)} of what you own, ${now > then ? 'up' : 'down'} from ${formatPercent(then)} in ${since}.`;
    }
  }

  return (
    <InsightCard
      label="Distribution Over Time"
      sentence={lock.text(sentence, 'See how what you own is split across cash, investments and more, and how that mix has shifted.')}
      note="What you own, by category. Debts aren’t included."
      {...lock.card}>
      <Segmented
        options={UNITS}
        value={unit}
        onChange={(u) => {
          setUnit(u);
          setPicked(null);
        }}
        style={styles.horizon}
      />
      <StackedBars
        values={d.values}
        colors={colors}
        labels={d.periods.map(periodLabel)}
        selected={at}
        onSelect={lock.locked ? undefined : setPicked}
      />
      <View style={styles.mixList}>
        <Text variant="footnote" weight="600" color="secondary">
          {`${periodName(d.periods[at])}${at === last ? ' (so far)' : ''}`}
        </Text>
        {d.categories.map((cat, k) =>
          d.values[at][k] > 0 ? (
            <View key={cat.id} style={styles.mixRow}>
              <View style={[styles.mixDot, { backgroundColor: colors[k % colors.length] }]} />
              <Text numberOfLines={1} style={styles.mixName}>
                {cat.name}
              </Text>
              <Text tabular color="secondary" style={styles.mixShare}>
                {lock.locked ? '••' : formatPercent(shareAt(at, k))}
              </Text>
              <Text tabular style={styles.mixValue}>
                {money(d.values[at][k], { whole: true })}
              </Text>
            </View>
          ) : null,
        )}
      </View>
    </InsightCard>
  );
}

type Horizon = '12' | '60' | '120' | '240' | '360' | 'goal';
const HORIZONS: { value: Horizon; label: string }[] = [
  { value: '12', label: '1Y' },
  { value: '60', label: '5Y' },
  { value: '120', label: '10Y' },
  { value: '240', label: '20Y' },
  { value: '360', label: '30Y' },
];
/** With a goal, the last choice shows the way to it. */
const WITH_GOAL: { value: Horizon; label: string }[] = [...HORIZONS.slice(0, 4), { value: 'goal', label: 'Goal' }];

const inYears = (months: number) => (months <= 12 ? 'in a year' : `in ${Math.round(months / 12)} years`);
/** "in 8 months", "in about 21 years". */
function fromNow(months: number): string {
  if (months < 12) return `in ${months} ${months === 1 ? 'month' : 'months'}`;
  const years = Math.round(months / 12);
  return `in about ${years} ${years === 1 ? 'year' : 'years'}`;
}
/** Nearest $10, for amounts that are estimates anyway. */
const roughly = (cents: number) => Math.round(cents / 1000) * 1000;

/**
 * Net worth so far, then a dotted line ahead like a forecast, in today's
 * money: what you add each month plus growth on what you have. With a goal,
 * its line runs to the goal's date and a bar shows how far along you are.
 */
function HeadedCard({ history, pace, counted }: { history: NetWorthMonth[]; pace: number | null; counted: number }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  /** "$1.7M" for goals of a million or more, "$250,000" below. */
  const short = (cents: number) => money(cents, { whole: true, compact: Math.abs(cents) >= 1_000_000_00 });
  const outlook = useStore((s) => s.settings.outlook);
  const goal = useStore((s) => s.settings.goal);
  const birthYear = useStore((s) => s.settings.birthYear);
  const [horizon, setHorizon] = useState<Horizon>(goal ? 'goal' : '60');
  const [at, setAt] = useState<number | null>(null);

  const now = history[history.length - 1];
  const current = now.end;
  const plan = makePlan(current, pace, outlook);
  if (!plan) return null;
  const status = goal ? goalStatus(goal, birthYear, current, plan, monthlyRate(outlook.growth), now.year, now.month) : null;
  const dueYear = goal ? goalYear(goal, birthYear) : null;
  const late = dueYear != null && dueYear < now.year;
  const options = status ? WITH_GOAL : HORIZONS;
  const picked = options.some((o) => o.value === horizon) ? horizon : status ? 'goal' : '60';
  const reach = status?.reachIn != null && status.reachIn > 0 ? status.reachIn : null;
  const span = status ? Math.max(status.due ?? 0, reach ?? 0) || 360 : 0;
  const ahead = picked === 'goal' ? Math.min(MAX_MONTHS, Math.max(12, Math.ceil((span + 6) / 12) * 12)) : Number(picked);

  const path = project(current, plan, ahead);
  const projected = path[ahead];
  const milestone = nextMilestone(current);
  const away = status ? null : monthsToReach(current, plan, milestone);

  // As much history as the projection is long, so the chart stays balanced:
  // 10Y runs from this month ten years ago to this month ten years ahead.
  const shown = history.slice(-Math.min(ahead + 1, history.length));
  const nowIndex = shown.length - 1;
  const count = nowIndex + ahead + 1;
  const actual = [...shown.map((m) => m.end), ...Array(ahead).fill(null)];
  const forecast = Array.from({ length: count }, (_, i) => (i < nowIndex ? null : path[i - nowIndex]));
  // A goal far beyond the chart would squash it, so its line shows once it's in view.
  const showGoal = !!status && !late && (picked === 'goal' || Math.max(...path) >= status.target * 0.6);
  const goalLine = showGoal
    ? Array.from({ length: count }, (_, i) =>
        i < nowIndex || (status.due != null && i - nowIndex > status.due) ? null : status.target,
      )
    : null;
  const end = shift(now, ahead);
  const labels: TrendLabel[] = [
    ...(nowIndex > 0 ? [{ index: 0, text: shortMonth(shown[0]) }] : []),
    { index: nowIndex, text: 'Today' },
    { index: count - 1, text: shortMonth(end) },
  ];
  // The goal's mark: where it's due, or for a goal without a date, where you'd get there.
  const goalAt = status?.due ?? reach;
  const marker =
    showGoal && goalAt != null && goalAt <= ahead
      ? { index: nowIndex + goalAt, value: status.target, color: c.warning }
      : !status && away != null && away <= ahead
        ? { index: nowIndex + away, value: milestone, color: c.warning }
        : null;

  const byWhen =
    goal?.age != null && birthYear != null ? `by age ${goal.age}` : status?.dueYear != null ? `by ${status.dueYear}` : '';
  const ageThen = (year: number) => (birthYear != null ? `, at ${year - birthYear}` : '');
  const adds = plan.monthly > 0 ? whole(roughly(plan.monthly)) : null;

  let sentence: string;
  if (status) {
    const target = short(status.target);
    const reached = reach != null ? shift(now, reach).year : null;
    const needed = status.needed != null ? whole(roughly(status.needed)) : '';
    if (status.progress >= 1) {
      sentence = `You’ve reached your ${target} goal. Time to set a bigger one?`;
    } else if (late) {
      sentence = `The date for your ${target} goal has passed. Pick a new one to see where you stand.`;
    } else if (status.due != null && status.onTrack) {
      sentence = `You’re on track for ${target} ${byWhen}. At your pace you’d get there around ${reached}${ageThen(reached!)}.`;
    } else if (status.due != null) {
      sentence =
        `${reached != null ? `At your pace you’d reach ${target} around ${reached}${ageThen(reached)}.` : `At your pace you wouldn’t reach ${target} within 50 years.`}` +
        ` To make it ${byWhen}, you’d need to add about ${needed} a month${adds ? ` instead of ${adds}` : ''}.`;
    } else {
      sentence =
        reached != null
          ? `At your pace you’d reach ${target} around ${reached}${ageThen(reached)}, ${fromNow(reach!)}.`
          : `At your pace you wouldn’t reach ${target} within 50 years.`;
    }
  } else {
    const lead =
      pace == null
        ? ''
        : pace > 0
          ? `Your net worth grows about ${whole(pace)} a month. `
          : pace < 0
            ? `Your net worth has fallen about ${whole(-pace)} a month lately. `
            : 'Your net worth has held steady lately. ';
    const keepsUp = plan.source === 'yours' ? `Adding ${whole(plan.monthly)} a month` : 'If that keeps up';
    if (away != null && away > 0 && away <= MAX_MONTHS) {
      const d = shift(now, away);
      sentence = `${lead}${keepsUp}, you’d ${milestone === 0 ? 'be back above zero' : `pass ${whole(milestone)}`} around ${MONTHS[d.month - 1]} ${d.year}.`;
    } else {
      sentence = `${lead}${keepsUp}, you’d have about ${whole(projected)} ${inYears(ahead)}, in today’s money.`;
    }
  }

  const growth = `${ratePercent(outlook.growth)} yearly growth on top of inflation`;
  const assumes =
    plan.source === 'falling'
      ? `Assumes it keeps falling as it has over the last ${counted} months.`
      : plan.source === 'yours'
        ? `Assumes you add ${whole(plan.monthly)} a month, with ${growth}.`
        : adds
          ? `Assumes you keep adding about ${adds} a month (your pace less what your money earned), with ${growth}.`
          : `Assumes ${growth}.`;
  const note = `In today’s money, with prices rising ${ratePercent(outlook.inflation)} a year. ${assumes}${pace != null ? ` Your pace is your average monthly change over the last ${counted} months.` : ''} A direction, not a promise.`;

  const dueIndex = picked === 'goal' && status?.due != null && !late ? Math.min(status.due, ahead) : null;
  const headline = at != null ? (actual[at] ?? forecast[at]!) : dueIndex != null ? path[dueIndex] : projected;
  const unit =
    at == null
      ? dueIndex != null
        ? `by the end of ${status!.dueYear}`
        : inYears(ahead)
      : at === nowIndex
        ? 'today'
        : at < nowIndex
          ? `in ${shortMonth(shift(shown[0], at))}`
          : `by ${shortMonth(shift(shown[0], at))}`;

  return (
    <InsightCard
      label="Where You’re Headed"
      sentence={lock.text(sentence, 'See what your net worth could be in 1 to 30 years, in today’s money, and set a goal like $1M by 50.')}
      {...lock.card}
      note={note}>
      <Segmented options={options} value={picked} onChange={setHorizon} style={styles.horizon} />
      <View style={styles.bigRow}>
        <Text variant="title2" weight="700" rounded tabular numberOfLines={1}>
          {whole(headline)}
        </Text>
        <Text variant="subheadline" color="secondary" numberOfLines={1} style={styles.bigUnit}>
          {unit}
        </Text>
      </View>
      <Text variant="footnote" color="secondary" style={[styles.todays, at != null && at <= nowIndex && styles.hidden]}>
        In today’s money
      </Text>
      <TrendKey
        items={[
          { label: 'Your net worth', color: c.up },
          { label: 'At your pace', color: c.up, dashed: true },
          ...(showGoal
            ? [{ label: lock.locked ? 'Goal' : `${short(status!.target)} goal`, color: c.warning, dashed: true }]
            : !status && away != null && away <= ahead
              ? [{ label: lock.locked ? 'Next milestone' : whole(milestone), color: c.warning }]
              : []),
        ]}
      />
      <TrendChart
        count={count}
        height={130}
        series={[
          ...(goalLine ? [{ values: goalLine, color: c.warning, dashed: true }] : []),
          { values: actual, color: c.up, endDot: true },
          { values: forecast, color: c.up, dashed: true },
        ]}
        marker={marker}
        labels={labels}
        onScrub={lock.locked ? undefined : setAt}
      />
      {status && !late ? (
        <View style={styles.goal}>
          <View style={[styles.goalTrack, { backgroundColor: c.fill }]}>
            <View
              style={[styles.goalFill, { width: `${Math.max(status.progress * 100, 1.5)}%`, backgroundColor: c.warning }]}
            />
          </View>
          <View style={styles.goalRow}>
            <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.goalText}>
              {`${lock.locked ? '••' : Math.floor(status.progress * 100)}% of the way to ${short(status.target)}${byWhen ? ` ${byWhen}` : ''}`}
            </Text>
            <GoalLink title="Edit Goal" onPress={() => router.push('/goal')} />
          </View>
        </View>
      ) : (
        <View style={styles.goalRow}>
          <GoalLink title={late ? 'Pick a New Date' : 'Set a Goal'} icon="flag" onPress={() => router.push('/goal')} />
        </View>
      )}
    </InsightCard>
  );
}

/** A small text button inside a card. In the Pro preview it's only a label: the whole card opens Pro. */
function GoalLink({ title, icon, onPress }: { title: string; icon?: 'flag'; onPress: () => void }) {
  const c = useColors();
  const locked = useInsightsPreview();
  if (locked) {
    return (
      <View style={styles.link}>
        {icon ? <Icon name={icon} size={13} weight="semibold" color={c.tint} /> : null}
        <Text variant="subheadline" weight="600" color="tint">
          {title}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.5 }]}>
      {icon ? <Icon name={icon} size={13} weight="semibold" color={c.tint} /> : null}
      <Text variant="subheadline" weight="600" color="tint">
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * Growth since January 1, this year against last, month by month. Someone
 * who started partway through the year sees growth since their first
 * balances, against the same months last year.
 */
function NetWorthYearCard({ year, soFar, lastYear }: { year: number; soFar: (number | null)[]; lastYear: (number | null)[] }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const { from, last, before, then } = compareYears(soFar, lastYear)!;
  const value = soFar[last]!;
  const hasBefore = lastIndex(before) >= 0;
  const [at, setAt] = useState<number | null>(null);
  const signed = (cents: number) => money(cents, { signed: true, whole: true });

  const since = from > 0 ? `since ${MONTHS[from]}` : 'this year';
  let sentence = value >= 0 ? `Your net worth is up ${whole(value)} ${since}` : `Your net worth is down ${whole(-value)} ${since}`;
  if (then != null) {
    const diff = value - then;
    const ref = from > 0 ? 'over the same months last year' : 'at this point last year';
    sentence +=
      Math.abs(diff) <= Math.max(Math.abs(then) * 0.03, 100)
        ? `, about the same as ${ref}.`
        : `, ${whole(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${ref}.`;
  } else {
    sentence += '.';
  }

  return (
    <InsightCard
      label="This Year vs Last Year"
      sentence={lock.text(sentence, `See whether your net worth is growing faster than it did in ${year - 1}.`)}
      note={
        from > 0
          ? `How much your net worth has grown since your first balances in ${MONTHS[from]}.`
          : 'How much your net worth has grown since January 1.'
      }
      {...lock.card}>
      {at != null ? (
        <Readout
          title={MONTHS[at]}
          items={[
            { label: String(year), value: soFar[at] != null ? signed(soFar[at]!) : '—', color: c.up },
            ...(hasBefore ? [{ label: String(year - 1), value: before[at] != null ? signed(before[at]!) : '—' }] : []),
          ]}
        />
      ) : hasBefore ? (
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
        onScrub={lock.locked ? undefined : setAt}
      />
    </InsightCard>
  );
}

function Spending() {
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const year = parseDateKey(today).y;
  const data = { spend, spendCategories };

  const soFar = spentSoFar(data, year, today);
  const creepAll = creepMonths(data, today);
  const history = spendHistory(data, today);
  const sp = spendingYear(data, year, today);
  const chartable = chartableCategories(data, today);
  const cards = useCards([
    lastIndex(soFar) >= 0 ? (
      <SpentYearCard key="year" year={year} soFar={soFar} lastYear={spentSoFar(data, year - 1, today)} />
    ) : null,
    lifestyleCreep(creepAll) ? <CreepCard key="creep" all={creepAll} /> : null,
    chartable.length ? <CategoryCard key="category" categories={chartable} /> : null,
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

/**
 * Spending added up since January, this year against last, with the year's
 * goals once you've set them: a spending limit adds up month by month on the
 * chart, and each goal gets a bar. Like Net Worth's goal, it's set from here.
 */
function SpentYearCard({ year, soFar, lastYear }: { year: number; soFar: (number | null)[]; lastYear: (number | null)[] }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const pct = (r: number) => (lock.locked ? '••%' : wholePercent(r));
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const goal = useStore((s) => s.settings.spendingGoal);
  // Someone who started partway through the year is counted from their first month, against the same months last year.
  const { from, last, before, then } = compareYears(soFar, lastYear)!;
  const value = soFar[last]!;
  const hasBefore = lastIndex(before) >= 0;
  const [at, setAt] = useState<number | null>(null);
  const editGoals = () => router.push('/spending-goal');

  let sentence =
    from === 0
      ? `You’ve spent ${whole(value)} this year through ${MONTHS[last]}`
      : from === last
        ? `You’ve spent ${whole(value)} in ${MONTHS[last]}`
        : `You’ve spent ${whole(value)} from ${MONTHS[from]} through ${MONTHS[last]}`;
  if (then != null) {
    const diff = value - then;
    const ref = from === 0 ? 'by then last year' : from === last ? `in ${MONTHS[last]} last year` : 'in the same months last year';
    sentence +=
      Math.abs(diff) <= then * 0.03
        ? `, about the same as ${ref}.`
        : `, ${whole(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than ${ref}.`;
  } else {
    sentence += '.';
  }

  const g = goal ? yearGoals({ spend, spendCategories }, goal, year, today) : null;
  const said = goal && g ? goalSentence(goal, g, whole) : null;
  if (said) sentence += ` ${said}`;

  const limit = goal?.limit;
  const limitLine = limit != null ? Array.from({ length: 12 }, (_, i) => (i < from ? null : limit * (i - from + 1))) : null;
  const bars: { key: string; progress: number; color: string; text: string }[] = [];
  if (goal?.keep != null && g?.kept != null) {
    bars.push({
      key: 'keep',
      progress: g.kept / goal.keep,
      color: g.kept >= goal.keep ? c.up : c.warning,
      text: `Kept ${pct(g.kept)} of what you earned · ${pct(goal.keep)} goal`,
    });
  }
  if (limit != null && g?.spent != null) {
    bars.push({
      key: 'limit',
      progress: g.spent / limit,
      color: g.spent > limit ? c.down : c.bar,
      text: `Average month: ${whole(g.spent)} of your ${whole(limit)} limit`,
    });
  }

  const keyItems = [
    { label: `${year}, added up`, color: c.bar },
    ...(hasBefore ? [{ label: `${year - 1}, added up`, color: c.tertiary }] : []),
    ...(limitLine ? [{ label: 'Limit', color: c.warning, dashed: true }] : []),
  ];

  return (
    <InsightCard
      label="This Year vs Last Year"
      sentence={lock.text(sentence, `See whether you’re spending more or less than you did by this point in ${year - 1}.`)}
      note="Counts each month once it’s over."
      {...lock.card}>
      {at != null ? (
        <Readout
          title={`By the end of ${MONTHS[at]}`}
          items={[
            { label: String(year), value: soFar[at] != null ? whole(soFar[at]!) : '—', color: c.bar },
            ...(hasBefore ? [{ label: String(year - 1), value: before[at] != null ? whole(before[at]!) : '—' }] : []),
            ...(limitLine ? [{ label: 'Limit', value: limitLine[at] != null ? whole(limitLine[at]!) : '—' }] : []),
          ]}
        />
      ) : keyItems.length > 1 ? (
        <TrendKey items={keyItems} />
      ) : null}
      <TrendChart
        count={12}
        series={[
          { values: before, color: c.tertiary },
          ...(limitLine ? [{ values: limitLine, color: c.warning, dashed: true }] : []),
          { values: soFar, color: c.bar, endDot: true },
        ]}
        labels={MONTH_LABELS}
        onScrub={lock.locked ? undefined : setAt}
      />
      {goal ? (
        <View style={styles.goals}>
          {bars.map((b, i) => (
            <View key={b.key} style={styles.goal}>
              <View style={[styles.goalTrack, { backgroundColor: c.fill }]}>
                <View
                  style={[
                    styles.goalFill,
                    { width: `${Math.min(100, Math.max(b.progress * 100, 1.5))}%`, backgroundColor: b.color },
                  ]}
                />
              </View>
              <View style={styles.goalRow}>
                <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.goalText}>
                  {b.text}
                </Text>
                {i === bars.length - 1 ? <GoalLink title="Edit Goals" onPress={editGoals} /> : null}
              </View>
            </View>
          ))}
          {bars.length ? null : (
            <View style={styles.goalRow}>
              <GoalLink title="Edit Goals" onPress={editGoals} />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.goalRow}>
          <GoalLink title="Set a Goal" icon="flag" onPress={editGoals} />
        </View>
      )}
    </InsightCard>
  );
}

/**
 * A sentence on the year's goals, after This Year vs Last Year's own. The
 * savings goal comes first, unless it's on track and the spending limit isn't.
 */
function goalSentence(goal: SpendingGoal, g: YearGoals, whole: (cents: number) => string): string | null {
  const keepOk = goal.keep != null && g.kept != null && g.kept >= goal.keep;
  const over = goal.limit != null && g.spent != null && g.spent > goal.limit;
  if (goal.keep != null && !(keepOk && over)) {
    if (g.kept == null) return g.months ? 'Enter your income in Spending to see how much of it you keep.' : null;
    if (keepOk) return `You’ve kept ${wholePercent(g.kept)} of what you earned, above your ${wholePercent(goal.keep)} goal.`;
    if (g.keepFromHere != null && g.keepFromHere <= 0.9) {
      return `Keep ${wholePercent(g.keepFromHere)} of what you earn from here on to end the year at your ${wholePercent(goal.keep)} goal.`;
    }
    return `You’ve kept ${wholePercent(g.kept)} of what you earned, short of your ${wholePercent(goal.keep)} goal.`;
  }
  if (goal.limit == null || g.spent == null) return null;
  if (!over) return `That’s ${whole(g.spent)} in an average month, under your ${whole(goal.limit)} limit.`;
  if (g.spendFromHere != null && g.spendFromHere > 0) {
    return `Averaging ${whole(g.spendFromHere)} a month from here on gets you back under your ${whole(goal.limit)} limit.`;
  }
  return `That’s ${whole(g.spent)} in an average month, over your ${whole(goal.limit)} limit.`;
}

type CreepRange = '12' | '24' | '60' | 'all';
const CREEP_RANGES: { value: CreepRange; label: string }[] = [
  { value: '12', label: '1Y' },
  { value: '24', label: '2Y' },
  { value: '60', label: '5Y' },
  { value: 'all', label: 'All' },
];

/** "Jan–Jun 2025", or "Nov 2024–Apr 2025" across a new year. */
function monthSpan(from: Month, to: Month): string {
  const a = MONTHS_SHORT[from.month - 1];
  const b = MONTHS_SHORT[to.month - 1];
  if (from.year === to.year && from.month === to.month) return `${a} ${to.year}`;
  return from.year === to.year ? `${a}–${b} ${to.year}` : `${a} ${from.year}–${b} ${to.year}`;
}

/**
 * Lifestyle creep in plain dollars: every month's spending as a bar, with
 * the steady months before the climb faded and the month it started marked,
 * so "about $1,800 a month, then a raise, then up and up" reads at a glance.
 * Income, when it's entered, says whether you're keeping more or less.
 */
function CreepCard({ all }: { all: CreepMonth[] }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const hidden = useStore((s) => s.settings.hideAmounts);
  const today = useToday();
  const [range, setRange] = useState<CreepRange | null>(null);
  const [at, setAt] = useState<number | null>(null);

  // A range shows once there's more history than the one before it, and enough in it to tell.
  const options = CREEP_RANGES.filter((r, i) => {
    if (i > 0 && all.length <= Number(CREEP_RANGES[i - 1].value)) return false;
    if (r.value === 'all') return all.length > 60;
    return lifestyleCreep(all.slice(-Number(r.value))) != null;
  });
  // Two years by default: long enough to reach back before a raise.
  const fallback = [...options].reverse().find((r) => r.value !== 'all' && Number(r.value) <= 24) ?? options[options.length - 1];
  const picked = options.find((r) => r.value === range) ?? fallback;
  const months = picked && picked.value !== 'all' ? all.slice(-Number(picked.value)) : all;
  const creep = lifestyleCreep(months);
  if (!creep) return null;
  const { before, lately, direction, start } = creep;
  const thisYear = parseDateKey(today).y;
  const when = (m: Month) => (m.year === thisYear ? MONTHS[m.month - 1] : `${MONTHS[m.month - 1]} ${m.year}`);

  const diff = lately.spent - before.spent;
  let sentence =
    direction === 'steady' || start == null
      ? `Your spending has held steady at about ${whole(lately.spent)} a month.`
      : `Your spending started ${direction === 'up' ? 'climbing' : 'falling'} in ${when(months[start])}. It’s ${direction === 'up' ? 'up' : 'down'} ${whole(Math.abs(diff))} a month from before.`;
  if (before.earned != null && lately.earned != null) {
    const raise = lately.earned - before.earned;
    const kept = raise - diff;
    const keeping =
      Math.abs(kept) < lately.earned * 0.03
        ? 'you’re keeping about the same'
        : `you’re keeping ${whole(Math.abs(kept))} ${kept > 0 ? 'more' : 'less'} a month`;
    if (Math.abs(raise) >= before.earned * 0.03) {
      sentence += ` Your income ${raise > 0 ? 'rose' : 'fell'} ${whole(Math.abs(raise))} a month, so ${keeping}.`;
    } else if (direction !== 'steady') {
      sentence += ` Your income stayed about the same, so ${keeping}.`;
    }
  }

  const count = months.length;
  const selected = at != null && at < count ? months[at] : null;
  const pick = (r: CreepRange) => {
    setRange(r);
    setAt(null);
  };
  const bars = months.map((m, i) => ({
    value: m.spent ?? 0,
    label: MONTHS_SHORT[m.month - 1][0],
    faded: start != null && i < start,
    accessibilityLabel: `${MONTHS[m.month - 1]} ${m.year}: ${m.spent == null ? 'nothing entered' : `spent ${money(m.spent, { whole: true })}`}`,
  }));
  const stats = [
    { label: `${start == null ? 'Earlier' : 'Before'} · ${monthSpan(before.from, before.to)}`, value: before.spent, color: undefined },
    { label: `Lately · ${monthSpan(lately.from, lately.to)}`, value: lately.spent, color: c.bar },
  ];

  return (
    <InsightCard
      label="Lifestyle Creep"
      sentence={lock.text(sentence, 'See when your spending started to climb, and how much more a month it is now.')}
      {...lock.card}
      note="Each bar is what you spent that month, not counting investing. Lately is your last three months. Counts each month once it’s over.">
      {options.length > 1 ? (
        <View pointerEvents={lock.locked ? 'none' : 'auto'}>
          <Segmented options={options} value={picked.value} onChange={pick} style={styles.horizon} />
        </View>
      ) : null}
      {selected ? (
        <Readout
          title={`${MONTHS[selected.month - 1]} ${selected.year}`}
          items={
            selected.spent == null
              ? [{ label: 'Nothing entered', value: '' }]
              : [
                  { label: 'Spent', value: whole(selected.spent), color: c.bar },
                  ...(selected.earned ? [{ label: 'Earned', value: whole(selected.earned), color: c.up }] : []),
                ]
          }
        />
      ) : (
        <View style={styles.creepStats}>
          {stats.map((x) => (
            <View key={x.label} style={styles.creepStat}>
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {x.label}
              </Text>
              <Text variant="title3" weight="700" rounded tabular numberOfLines={1} style={x.color ? { color: x.color } : null}>
                {whole(x.value)}
                <Text variant="footnote" weight="500" color="secondary">
                  {' a month'}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      )}
      <BarChart
        bars={bars}
        marker={start != null ? { index: start, label: direction === 'up' ? 'Climb starts' : 'Drop starts' } : null}
        selected={at}
        onSelect={lock.locked ? undefined : setAt}
        formatTick={hidden || lock.locked ? undefined : (v) => money(v, { compact: true, whole: true })}
        axisLabels={count > 13 ? yearLabels(months.map((m) => ({ ...m, value: m.spent }))) : undefined}
        height={150}
      />
    </InsightCard>
  );
}

/**
 * One category at a time, month by month for the last year, like Screen
 * Time's daily bars: eating out at $150 in January and $500 by October shows
 * at a glance. Pills pick the category; every month it has is a tap away.
 */
function CategoryCard({ categories }: { categories: SpendCategory[] }) {
  const lock = useLock();
  const money = lock.money;
  const groupColor = useGroupColor();
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const [picked, setPicked] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const category = categories.find((x) => x.id === picked) ?? categories[0];
  const whole = (cents: number) => money(cents, { whole: true });

  const data = { spend, spendCategories };
  const months = recentCategoryMonths(data, category.id, today, 12);
  const average = averageOf(months);
  const change = categoryChange(recentCategoryMonths(data, category.id, today, 24));
  const sentence = categorySentence(category.name, months, change, average, whole);
  const pick = (id: string) => {
    setPicked(id);
    setAt(null);
  };
  const open = () => router.push({ pathname: '/insights/category', params: { id: category.id } });
  const selected = at != null ? months[at] : null;
  const verb = category.group === 'income' ? 'Earned' : category.group === 'invest' ? 'Invested' : 'Spent';

  return (
    <InsightCard
      label="By Category"
      sentence={lock.text(sentence, 'See how each category, like eating out or rent, changes month to month.')}
      note="Lately means your last three months. Counts each month once it’s over."
      {...lock.card}>
      <CategoryPills categories={categories} value={category.id} onChange={pick} locked={lock.locked} />
      {selected ? (
        <Readout
          title={`${MONTHS[selected.month - 1]} ${selected.year}`}
          items={[{ label: verb, value: selected.value == null ? 'Nothing entered' : whole(selected.value) }]}
        />
      ) : (
        <Readout
          title="Last 12 Months"
          items={average != null ? [{ label: 'Average', value: `${whole(average)}/mo` }] : []}
        />
      )}
      <BarChart
        bars={categoryBars(months, money)}
        color={groupColor(category.group)}
        average={average}
        selected={at}
        onSelect={lock.locked ? undefined : setAt}
        formatTick={hidden || lock.locked ? undefined : (v) => money(v, { compact: true, whole: true })}
        height={130}
      />
      <View style={[styles.goalRow, styles.more]}>
        <GoalLink title="See Every Month" onPress={open} />
      </View>
    </InsightCard>
  );
}

/** The year's biggest spending categories, with the full list a tap away. */
function WhereItWentCard({ year }: { year: number }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
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
      sentence={lock.text(
        `${top.category.name} took the biggest share of your spending this year, ${formatPercent(top.share)}.`,
        'See every category a month on average, and how each compares with last year.',
      )}
      note={canCompare ? `Next to each bar is how much more or less you spent a month than in ${year - 1}.` : null}
      onPress={() => router.push({ pathname: '/insights/where-it-went', params: { year: String(year) } })}
      {...lock.card}>
      {sp.categories.slice(0, 5).map((x) => {
        const change = canCompare ? x.monthly - (lastYearMonthly.get(x.category.id) ?? 0) : null;
        return (
          <RankRow
            key={x.category.id}
            title={x.category.name}
            value={`${whole(x.monthly)}/mo`}
            share={x.share / top.share}
            color={c.bar}
            note={lock.locked ? MASK : change == null ? formatPercent(x.share) : change === 0 ? 'Same' : signed(change)}
            // Spending more is the bad direction.
            noteColor={lock.locked || change == null || change === 0 ? 'secondary' : change > 0 ? 'down' : 'up'}
          />
        );
      })}
    </InsightCard>
  );
}

/** What's under the finger, in place of the chart's key while dragging. */
function Readout({ title, items }: { title: string; items: { label: string; value: string; color?: string }[] }) {
  return (
    <View style={styles.readout}>
      <Text variant="footnote" weight="600" numberOfLines={1}>
        {title}
      </Text>
      {items.map((it) => (
        <Text key={it.label} variant="footnote" color="secondary" numberOfLines={1}>
          {`${it.label} `}
          <Text variant="footnote" weight="600" tabular color={it.color ?? 'text'}>
            {it.value}
          </Text>
        </Text>
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
  mixList: {
    marginTop: 16,
    gap: 8,
  },
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mixDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  mixName: {
    flex: 1,
  },
  mixShare: {
    minWidth: 52,
    textAlign: 'right',
  },
  mixValue: {
    minWidth: 92,
    textAlign: 'right',
  },
  bigUnit: {
    flexShrink: 1,
    marginLeft: 5,
  },
  todays: {
    marginTop: -6,
    marginBottom: 10,
  },
  hidden: {
    opacity: 0,
  },
  goal: {
    marginTop: 16,
    gap: 8,
  },
  goals: {
    marginTop: 4,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  goalFill: {
    height: 6,
    borderRadius: 3,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  goalText: {
    flex: 1,
  },
  more: {
    marginTop: 12,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  creepStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  creepStat: {
    flex: 1,
    gap: 2,
  },
  readout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
});
