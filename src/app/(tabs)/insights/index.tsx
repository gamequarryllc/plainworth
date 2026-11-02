import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { MONTHS, MONTHS_SHORT, parseDateKey } from '@/lib/dates';
import { firstYear, spendingYear, type Month } from '@/lib/insights';
import { formatPercent, MASK } from '@/lib/money';
import { goalStatus, goalYear, makePlan, MAX_MONTHS, monthlyRate, monthsToReach, project, ratePercent } from '@/lib/outlook';
import {
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
  type Creep,
  type NetWorthMonth,
  type PeriodUnit,
} from '@/lib/trends';
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
      <NetWorthYearCard key="year" year={year} soFar={soFar} before={netWorthSoFar(history, year - 1)} />
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
          {`${periodName(d.periods[at])}${at === last ? ' (so far)' : ''} · ${money(totalAt(at), { whole: true })}`}
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

  // As much history as the projection is long, so the chart stays balanced.
  const shown = history.slice(-Math.min(ahead, history.length));
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

/** Growth since January 1, this year against last, month by month. */
function NetWorthYearCard({ year, soFar, before }: { year: number; soFar: (number | null)[]; before: (number | null)[] }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const last = lastIndex(soFar);
  const value = soFar[last]!;
  const then = before[last];
  const hasBefore = lastIndex(before) >= 0;
  const [at, setAt] = useState<number | null>(null);
  const signed = (cents: number) => money(cents, { signed: true, whole: true });

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
    <InsightCard
      label="This Year vs Last Year"
      sentence={lock.text(sentence, `See whether your net worth is growing faster than it did in ${year - 1}.`)}
      note="How much your net worth has grown since January 1."
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
  const creep = lifestyleCreep(data, today);
  const history = spendHistory(data, today);
  const sp = spendingYear(data, year, today);
  const goal = useStore((s) => s.settings.spendingGoal);
  const goals = <YearGoalsCard key="goals" year={year} />;
  const cards = useCards([
    goal ? goals : null,
    lastIndex(soFar) >= 0 ? (
      <SpentYearCard key="year" year={year} soFar={soFar} before={spentSoFar(data, year - 1, today)} />
    ) : null,
    creep ? <CreepCard key="creep" creep={creep} /> : null,
    sp?.categories.length ? <WhereItWentCard key="where" year={year} /> : null,
    // Without goals, the card that offers them goes last.
    goal || !sp ? null : goals,
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
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const last = lastIndex(soFar);
  const value = soFar[last]!;
  const then = before[last];
  const hasBefore = lastIndex(before) >= 0;
  const [at, setAt] = useState<number | null>(null);

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
          ]}
        />
      ) : hasBefore ? (
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
        onScrub={lock.locked ? undefined : setAt}
      />
    </InsightCard>
  );
}

/** Income and spending, each as a change from where it started: spending climbing faster is creep. */
function CreepCard({ creep }: { creep: Creep }) {
  const c = useColors();
  const lock = useLock();
  const { income, spending, year } = creep;
  const [at, setAt] = useState<number | null>(null);
  const pct = (r: number | null) => (r == null ? '—' : `${r < 0 ? '−' : '+'}${Math.round(Math.abs(r) * 100)}%`);
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
      sentence={lock.text(sentence, 'See whether your spending is growing faster than your income.')}
      {...lock.card}
      note={`Compares your average month in ${year} with ${year - 1}. Each line is a six-month average, as a change from where it started. When the blue line climbs faster than the green one, that’s creep.`}>
      {at != null ? (
        <Readout
          title={shortMonth(creep.months[at])}
          items={[
            ...(income != null ? [{ label: 'Income', value: pct(creep.incomeLine[at]), color: c.up }] : []),
            { label: 'Spending', value: pct(creep.spendingLine[at]), color: c.bar },
          ]}
        />
      ) : (
        <TrendKey
          items={[
            ...(income != null ? [{ label: 'Income', color: c.up }] : []),
            { label: 'Spending', color: c.bar },
          ]}
        />
      )}
      <TrendChart
        count={count}
        zero
        series={[
          { values: creep.incomeLine, color: c.up, endDot: true },
          { values: creep.spendingLine, color: c.bar, endDot: true },
        ]}
        labels={labels}
        onScrub={lock.locked ? undefined : setAt}
      />
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

const wholePercent = (r: number) => `${Math.round(r * 100)}%`;

/**
 * The year's spending goals: how much of what you earn you've kept, against
 * your goal, month by month as the year adds up; and your average month
 * against a spending limit. Judged over the year, so one big month evens out.
 */
function YearGoalsCard({ year }: { year: number }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const goal = useStore((s) => s.settings.spendingGoal);
  const [at, setAt] = useState<number | null>(null);
  const edit = () => router.push('/spending-goal');
  const teaser = 'Set goals for the year, like keeping 20% of what you earn, and see how you’re doing as the months add up.';

  if (!goal) {
    return (
      <InsightCard label="Yearly Goals" sentence={teaser} {...lock.card}>
        <View style={styles.goalRow}>
          <GoalLink title="Set a Goal" icon="flag" onPress={edit} />
        </View>
      </InsightCard>
    );
  }

  const g = yearGoals({ spend, spendCategories }, goal, year, today);
  const pct = (r: number) => (lock.locked ? '••%' : wholePercent(r));
  let sentence: string;
  if (goal.keep != null) {
    if (g.kept == null) {
      sentence = g.months
        ? 'Enter your income in Spending to see how much of it you keep.'
        : 'Your goals start counting once January is over.';
    } else if (g.kept >= goal.keep) {
      sentence = `You’ve kept ${wholePercent(g.kept)} of what you earned this year, above your ${wholePercent(goal.keep)} goal.`;
    } else if (g.keepFromHere != null && g.keepFromHere <= 0.9) {
      sentence = `You’ve kept ${wholePercent(g.kept)} of what you earned this year. Keep ${wholePercent(g.keepFromHere)} from here on to end the year at ${wholePercent(goal.keep)}.`;
    } else {
      sentence = `You’ve kept ${wholePercent(g.kept)} of what you earned this year, short of your ${wholePercent(goal.keep)} goal.`;
    }
  } else if (g.spent == null) {
    sentence = 'Your goals start counting once January is over.';
  } else if (g.spent <= goal.limit!) {
    sentence = `You’ve spent ${whole(g.spent)} in an average month this year, under your ${whole(goal.limit!)} limit.`;
  } else if (g.spendFromHere != null && g.spendFromHere > 0) {
    sentence = `You’ve spent ${whole(g.spent)} in an average month this year, over your ${whole(goal.limit!)} limit. Averaging ${whole(g.spendFromHere)} from here on gets you back under.`;
  } else {
    sentence = `You’ve spent ${whole(g.spent)} in an average month this year, over your ${whole(goal.limit!)} limit.`;
  }

  // The chart follows the savings goal if there is one, otherwise the spending limit.
  const saving = goal.keep != null;
  const line = saving ? g.keptLine : g.spentLine;
  const target = saving ? goal.keep! : goal.limit!;
  const color = saving ? c.up : c.bar;
  const show = (v: number) => (saving ? pct(v) : whole(v));
  const limitBar = saving && goal.limit != null && g.spent != null;

  return (
    <InsightCard
      label="Yearly Goals"
      sentence={lock.text(sentence, teaser)}
      note={
        saving
          ? 'Saved and invested, out of what you earned, since January. Counts each month once it’s over.'
          : 'Your average month since January. Counts each month once it’s over.'
      }
      {...lock.card}>
      {lastIndex(line) >= 0 ? (
        <>
          {at != null ? (
            <Readout
              title={`Through ${MONTHS[at]}`}
              items={[
                { label: saving ? 'Kept' : 'Average month', value: line[at] != null ? show(line[at]!) : '—', color },
                { label: 'Goal', value: show(target) },
              ]}
            />
          ) : (
            <TrendKey
              items={[
                { label: saving ? 'Kept so far' : 'Average month', color },
                { label: saving ? `${pct(target)} goal` : `${whole(target)} limit`, color: c.warning, dashed: true },
              ]}
            />
          )}
          <TrendChart
            count={12}
            series={[
              { values: Array(12).fill(target), color: c.warning, dashed: true },
              { values: line, color, endDot: true },
            ]}
            labels={MONTH_LABELS}
            onScrub={lock.locked ? undefined : setAt}
          />
        </>
      ) : null}
      {limitBar ? (
        <View style={styles.goal}>
          <View style={[styles.goalTrack, { backgroundColor: c.fill }]}>
            <View
              style={[
                styles.goalFill,
                {
                  width: `${Math.min(100, Math.max(1.5, (g.spent! / goal.limit!) * 100))}%`,
                  backgroundColor: g.spent! > goal.limit! ? c.down : c.bar,
                },
              ]}
            />
          </View>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {`Average month: ${whole(g.spent!)} of your ${whole(goal.limit!)} limit`}
          </Text>
        </View>
      ) : null}
      <View style={styles.goalRow}>
        <GoalLink title="Edit Goals" onPress={edit} />
      </View>
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
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  readout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 10,
  },
});
