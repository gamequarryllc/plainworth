import { router, useLocalSearchParams } from "expo-router";
import { useContext, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { BarChart } from "@/components/bar-chart";
import {
  CategoryPills,
  categoryBars,
  useGroupColor,
} from "@/components/category-trend";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { IncomeSources } from "@/components/income-sources";
import { InsightCard, RankRow } from "@/components/insight-card";
import { YearPills } from "@/components/pills";
import {
  InsightsUnlocked,
  InsightsWaiting,
  PreviewFooter,
  useInsightsPreview,
  useInsightsWaiting,
} from "@/components/insights-preview";
import { Row, Section } from "@/components/list";
import { SampleBanner, SampleData, startNetWorth, useSampleGuard } from "@/components/sample";
import { Screen } from "@/components/screen";
import { Segmented } from "@/components/segmented";
import { StackedBars, useCategoryColors } from "@/components/stacked-bars";
import { useTabButtons } from "@/components/tab-buttons";
import { Text } from "@/components/text";
import {
  TrendChart,
  TrendKey,
  type TrendLabel,
} from "@/components/trend-chart";
import { useEmergencyFund } from "@/hooks/use-emergency-fund";
import { useMoney } from "@/hooks/use-money";
import { useToday } from "@/hooks/use-today";
import {
  averageOf,
  categoryMonths,
  categoryYearMonths,
  categoryYears,
  chartableCategories,
} from "@/lib/category-trend";
import { dayNumber, MONTHS, MONTHS_SHORT, parseDateKey } from "@/lib/dates";
import {
  firstYear,
  growingMix,
  incomeYears,
  shownYear,
  spendingYear,
  spendingYears,
  type Month,
} from "@/lib/insights";
import { formatPercent, MASK, roundsToZero } from "@/lib/money";
import { STORE_SHOTS } from "@/lib/store-shots";
import {
  goalStatus,
  growthOf,
  goalYear,
  makePlan,
  MAX_MONTHS,
  monthsToReach,
  project,
  ratePercent,
  type Mix,
  type Plan,
} from "@/lib/outlook";
import {
  compareYears,
  creepMonths,
  creepYear,
  creepYears,
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
} from "@/lib/trends";
import { accountNames, formatMonths, fundBalance, fundStatus, sampleFund } from "@/lib/emergency";
import { categoryTotals } from "@/lib/spending";
import type { SpendCategory, SpendingGoal } from "@/lib/types";
import { SampleContext, useStore } from "@/store";
import { usePreviewing, useSampleOn } from "@/store/sample-hidden";
import { openPaywall } from "@/store/pro";
import { useColors } from "@/theme";

type Part = "networth" | "spending";
const PARTS: { value: Part; label: string }[] = [
  { value: "networth", label: "Net Worth" },
  { value: "spending", label: "Spending" },
];

/**
 * Progress over time, chart first: where net worth is headed, this year
 * against last, and lifestyle creep. Net Worth and Spending are one tap
 * apart and never mixed, so neither is thrown off by how much of the other
 * tracker is filled in. As a preview, every card shows its chart's shape
 * with the numbers and answers hidden, and opens Pro when tapped.
 */
export default function InsightsTab() {
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const preview = useInsightsPreview();
  const sampleOn = useSampleOn();
  const previewing = usePreviewing();
  const sample =
    !preview && ((sampleOn && firstYear({ snapshots, spend }) == null) || previewing);
  // With nothing entered yet and Pro unlocked, the page shows itself drawn
  // from made-up sample data, numbers and all. Without Pro it's the preview,
  // as ever: the same sample charts, blurred behind Unlock with Pro.
  return sample ? (
    <SampleData start={startNetWorth}>
      <InsightsUnlocked>
        <InsightsScreen sample />
      </InsightsUnlocked>
    </SampleData>
  ) : (
    <InsightsScreen />
  );
}

function InsightsScreen({ sample }: { sample?: boolean }) {
  const tabButtons = useTabButtons();
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const [part, setPart] = useState<Part>("networth");
  const preview = useInsightsPreview();
  // App Store screenshot builds: plainworth:///insights?shot=spending opens on
  // Spending, ?shot=fund on Spending scrolled down to the emergency fund, and
  // ?shot=distribution on Net Worth scrolled down to Distribution Over Time.
  const shot = useLocalSearchParams<{ shot?: string }>().shot;
  const [shotSeen, setShotSeen] = useState<string | undefined>(undefined);
  if (STORE_SHOTS && shot !== shotSeen) {
    setShotSeen(shot);
    if (shot === "spending" || shot === "networth") setPart(shot);
    if (shot === "fund") setPart("spending");
    if (shot === "distribution") setPart("networth");
  }

  if (!preview && firstYear({ snapshots, spend }) == null) {
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
    <Screen title="Insights" large left={tabButtons} atEnd={STORE_SHOTS && (shot === "fund" || shot === "distribution")}>
      {sample ? (
        <SampleBanner
          action="Add an Account"
          icon="plus"
          onAction={startNetWorth}
        />
      ) : null}
      <Segmented
        options={PARTS}
        value={part}
        onChange={setPart}
        style={styles.parts}
      />
      {part === "networth" ? <NetWorth /> : <Spending />}
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
  const preview = useInsightsPreview();
  const waiting = useInsightsWaiting();
  const locked = preview || waiting != null;
  const money = useMoney();
  return {
    locked,
    money: (locked ? () => MASK : money) as typeof money,
    card: preview
      ? { locked: true, onPress: () => openPaywall("insights") }
      : waiting != null
        ? { waiting }
        : {},
    text: (answer: string, teaser: string) => (locked ? teaser : answer),
  };
}

const shortMonth = (m: Month) => `${MONTHS_SHORT[m.month - 1]} ${m.year}`;
const lastIndex = (values: (number | null)[]) =>
  values.reduce<number>((last, v, i) => (v != null ? i : last), -1);
const MONTH_LABELS: TrendLabel[] = MONTHS_SHORT.map((m, i) => ({
  index: i,
  text: m[0],
}));
const wholePercent = (r: number) => `${Math.round(r * 100)}%`;

/**
 * In the Pro preview, a page without enough history to fill its cards is
 * drawn from the sample instead, so the blurred charts still show what Pro
 * holds. Nothing made up is ever readable: the preview blurs every chart and
 * hides every number.
 */
function NetWorth({ filled }: { filled?: boolean }) {
  const preview = useInsightsPreview();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const year = parseDateKey(today).y;

  const history = netWorthHistory({ accounts, snapshots, nwCategories }, today);
  const some = history.length > 0;
  // Enough of your own for the Pro preview to show it instead of the sample.
  const compared =
    history.length >= 2 && lastIndex(netWorthSoFar(history, year)) >= 0;
  // Where You're Headed waits for a saving pace (two finished months), unless
  // a monthly amount was typed in: growth alone looks discouragingly flat.
  const ownMonthly = useStore((s) => s.settings.outlook.monthly);
  const paced = netWorthPace(history) != null || ownMonthly != null;

  if (preview && !filled && !compared) {
    return (
      <SampleData>
        <NetWorth filled />
      </SampleData>
    );
  }

  // Every card shows from the start. One without the history it needs yet is
  // drawn from the sample, blurred, with what it's waiting for.
  return (
    <>
      {!some && !preview ? (
        <Section footer="No balances entered yet.">
          {accounts.length === 0 ? (
            <Row
              title="Add an Account"
              titleColor="tint"
              chevron={false}
              onPress={() => router.push("/account-form")}
            />
          ) : null}
        </Section>
      ) : null}
      <Waiting needs={paced ? null : "Needs 2 months of balances"}>
        <HeadedFromStore />
      </Waiting>
      <Waiting needs={some ? null : "Needs a balance"}>
        <DistributionCard />
      </Waiting>
    </>
  );
}

/** The card inside as it is, or with `needs`, as a blurred example that says what it's waiting for. */
function Waiting({
  needs,
  children,
}: {
  needs: string | null;
  children: ReactNode;
}) {
  if (needs == null) return <>{children}</>;
  return (
    <SampleData>
      <InsightsWaiting needs={needs}>{children}</InsightsWaiting>
    </SampleData>
  );
}

function useHistory() {
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  return netWorthHistory({ accounts, snapshots, nwCategories }, today);
}

function HeadedFromStore() {
  const history = useHistory();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const pace = netWorthPace(history);
  if (!history.length) return null;
  return (
    <HeadedCard
      history={history}
      pace={pace?.perMonth ?? null}
      counted={pace?.months ?? 0}
      mix={growingMix({ accounts, snapshots, nwCategories }, dayNumber(today))}
    />
  );
}

const UNITS: { value: PeriodUnit; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
];

const periodLabel = (p: Month & { unit: PeriodUnit }) =>
  p.unit === "month"
    ? // January carries its year, so a long scroll back stays readable.
      p.month === 1
      ? `Jan ’${String(p.year).slice(2)}`
      : MONTHS_SHORT[p.month - 1]
    : p.unit === "quarter"
      ? `Q${p.month / 3} ’${String(p.year).slice(2)}`
      : String(p.year);
const periodName = (p: Month & { unit: PeriodUnit }) =>
  p.unit === "month"
    ? `${MONTHS[p.month - 1]} ${p.year}`
    : p.unit === "quarter"
      ? `Q${p.month / 3} ${p.year}`
      : String(p.year);

/** What your assets are made of, period by period, as stacked columns. Tap one for its breakdown. */
function DistributionCard() {
  const lock = useLock();
  const c = useColors();
  const money = lock.money;
  const colors = useCategoryColors();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const [unit, setUnit] = useState<PeriodUnit>("month");
  const [picked, setPicked] = useState<number | null>(null);
  const d = distribution({ accounts, snapshots, nwCategories }, today, unit);
  if (d.periods.length === 0 || d.categories.length === 0) return null;
  const last = d.periods.length - 1;
  const at = picked != null && picked <= last ? picked : last;
  const assetsAt = (i: number) => d.values[i].reduce((s, v) => s + v, 0);
  // Debts come off, so the total is net worth.
  const totalAt = (i: number) => assetsAt(i) - d.debts[i];
  const shareAt = (i: number, k: number) =>
    assetsAt(i) > 0 ? d.values[i][k] / assetsAt(i) : 0;
  const top = d.categories[0];

  // What it all adds up to and how that moved, not the share the list below already shows.
  const whole = (cents: number) => money(cents, { whole: true });
  const total = totalAt(last);
  const afterDebts = d.debts[last] > 0 ? ", after debts." : ".";
  let sentence =
    d.categories.length > 1
      ? `${whole(total)} across ${d.categories.length} categories${afterDebts}`
      : `${whole(total)} in ${top.name}${afterDebts}`;
  if (last > 0) {
    const diff = total - totalAt(0);
    const since = periodName(d.periods[0]);
    sentence =
      Math.abs(diff) < Math.max(Math.abs(totalAt(0)) * 0.01, 100_00)
        ? `${whole(total)}, about the same as ${since}.`
        : `${whole(total)}, ${diff > 0 ? "up" : "down"} ${whole(Math.abs(diff))} since ${since}.`;
  }
  // A tapped bar: that period's net worth and how it moved from the one before.
  if (picked != null && picked <= last) {
    const now = totalAt(picked);
    const name = periodName(d.periods[picked]);
    if (picked === 0) sentence = `${whole(now)} in ${name}.`;
    else {
      const before = totalAt(picked - 1);
      const diff = now - before;
      const p0 = d.periods[picked - 1];
      // Same year: "from September", not "from September 2026".
      const prev =
        p0.unit !== "year" && p0.year === d.periods[picked].year
          ? periodName(p0).replace(` ${p0.year}`, "")
          : periodName(p0);
      sentence =
        Math.abs(diff) < Math.max(Math.abs(before) * 0.01, 100_00)
          ? `${whole(now)} in ${name}, about the same as ${prev}.`
          : `${whole(now)} in ${name}, ${diff > 0 ? "up" : "down"} ${whole(Math.abs(diff))} from ${prev}.`;
    }
  }

  return (
    <InsightCard
      label="Distribution Over Time"
      sentence={lock.text(
        sentence,
        "See how what you own is split across cash, investments and more, and how that mix has shifted.",
      )}
      note="What you own, by category, minus what you owe. It adds up to your net worth."
      {...lock.card}
    >
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
        below={d.debts}
      />
      <View style={styles.mixList}>
        <Text variant="footnote" weight="600" color="secondary">
          {`${periodName(d.periods[at])}${at === last ? " (so far)" : ""}`}
        </Text>
        {d.categories.map((cat, k) =>
          d.values[at][k] > 0 ? (
            <View key={cat.id} style={styles.mixRow}>
              <View
                style={[
                  styles.mixDot,
                  { backgroundColor: colors[k % colors.length] },
                ]}
              />
              <Text numberOfLines={1} style={styles.mixName}>
                {cat.name}
              </Text>
              <Text tabular color="secondary" style={styles.mixShare}>
                {lock.locked ? "••" : formatPercent(shareAt(at, k))}
              </Text>
              <Text tabular style={styles.mixValue}>
                {money(d.values[at][k], { whole: true })}
              </Text>
            </View>
          ) : null,
        )}
        {d.debts[at] > 0 ? (
          <View style={styles.mixRow}>
            <View style={[styles.mixDot, { backgroundColor: c.down }]} />
            <Text numberOfLines={1} style={styles.mixName}>
              Debts
            </Text>
            <Text tabular style={styles.mixValue}>
              {money(-d.debts[at], { whole: true })}
            </Text>
          </View>
        ) : null}
      </View>
    </InsightCard>
  );
}

type Horizon = "12" | "60" | "120" | "240" | "360" | "goal";
const HORIZONS: { value: Horizon; label: string }[] = [
  { value: "12", label: "1Y" },
  { value: "60", label: "5Y" },
  { value: "120", label: "10Y" },
  { value: "240", label: "20Y" },
  { value: "360", label: "30Y" },
];
/** With a goal, the last choice shows the way to it. */
const WITH_GOAL: { value: Horizon; label: string }[] = [
  ...HORIZONS.slice(0, 4),
  { value: "goal", label: "Goal" },
];

const inYears = (months: number) =>
  months <= 12 ? "in a year" : `in ${Math.round(months / 12)} years`;
/** Nearest $10, for amounts that are estimates anyway. */
const roughly = (cents: number) => Math.round(cents / 1000) * 1000;

/**
 * Net worth so far, then a dotted line ahead like a forecast, in today's
 * money: the monthly pace plus growth on what's invested. With a goal,
 * its line runs to the goal's date and a bar shows how far along you are.
 */
function HeadedCard({
  history,
  pace,
  counted,
  mix,
}: {
  history: NetWorthMonth[];
  pace: number | null;
  counted: number;
  /** How much of what's owned is invested: only that part grows. */
  mix: Mix;
}) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  /** "$1.7M" for goals of a million or more, "$250,000" below. */
  const short = (cents: number) =>
    money(cents, { whole: true, compact: Math.abs(cents) >= 1_000_000_00 });
  const outlook = useStore((s) => s.settings.outlook);
  const goal = useStore((s) => s.settings.goal);
  const birthYear = useStore((s) => s.settings.birthYear);
  const [horizon, setHorizon] = useState<Horizon>(goal ? "goal" : "60");

  const now = history[history.length - 1];
  const current = now.end;
  const base = growthOf(outlook, mix);
  const plan: Plan = makePlan(current, pace, outlook, mix) ?? {
    ...base,
    monthly: 0,
    source: "pace",
    earned: 0,
  };
  const status = goal
    ? goalStatus(goal, birthYear, current, plan, base, now.year, now.month)
    : null;
  const dueYear = goal ? goalYear(goal, birthYear) : null;
  const late = dueYear != null && dueYear < now.year;
  const options = status ? WITH_GOAL : HORIZONS;
  const picked = options.some((o) => o.value === horizon)
    ? horizon
    : status
      ? "goal"
      : "60";
  const reach =
    status?.reachIn != null && status.reachIn > 0 ? status.reachIn : null;
  // Already there with no date to run to: a year ahead is plenty.
  const span = status
    ? Math.max(status.due ?? 0, reach ?? 0) || (status.progress >= 1 ? 6 : 360)
    : 0;
  const ahead =
    picked === "goal"
      ? Math.min(MAX_MONTHS, Math.max(12, Math.ceil((span + 6) / 12) * 12))
      : Number(picked);

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
  const forecast = Array.from({ length: count }, (_, i) =>
    i < nowIndex ? null : path[i - nowIndex],
  );
  // A goal far beyond the chart would squash it, so its line shows once it's in view.
  const showGoal =
    !!status &&
    !late &&
    (picked === "goal" || Math.max(...path) >= status.target * 0.6);
  const goalLine = showGoal
    ? Array.from({ length: count }, (_, i) =>
        i < nowIndex || (status.due != null && i - nowIndex > status.due)
          ? null
          : status.target,
      )
    : null;
  const end = shift(now, ahead);
  const labels: TrendLabel[] = [
    ...(nowIndex > 0 ? [{ index: 0, text: shortMonth(shown[0]) }] : []),
    { index: nowIndex, text: "Today" },
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
  // Say when the goal is due right under its mark, so the ring isn't a mystery.
  if (marker && status && goalAt != null) {
    labels.push({
      index: marker.index,
      text:
        status.due != null && goal?.age != null && birthYear != null
          ? `Age ${goal.age}`
          : String(shift(now, goalAt).year),
      color: c.warning,
    });
  }

  const byWhen =
    goal?.age != null && birthYear != null
      ? `by age ${goal.age}`
      : status?.dueYear != null
        ? `by ${status.dueYear}`
        : "";
  // "at 44" when we know their age, otherwise "around 2047".
  const when = (year: number) =>
    birthYear != null ? `at ${year - birthYear}` : `around ${year}`;
  const adds = plan.monthly > 0 ? whole(roughly(plan.monthly)) : null;

  let sentence: string;
  if (status) {
    const target = short(status.target);
    const reached = reach != null ? shift(now, reach).year : null;
    const needed = status.needed != null ? whole(roughly(status.needed)) : "";
    if (status.progress >= 1) {
      sentence = `You reached ${target}. Time for a bigger goal?`;
    } else if (late) {
      sentence = `Your ${target} date has passed. Pick a new one.`;
    } else if (status.due != null && status.onTrack) {
      sentence = `On track for ${target} ${byWhen}.`;
    } else if (status.due != null) {
      sentence = `It takes about ${needed} a month to hit ${target} ${byWhen}.`;
    } else {
      sentence =
        reached != null
          ? `${target} ${when(reached)} at your pace.`
          : `${target} is over 50 years away at your pace.`;
    }
  } else {
    const lead =
      pace == null
        ? ""
        : pace > 0
          ? `Growing ${whole(pace)} a month.`
          : pace < 0
            ? `Falling ${whole(-pace)} a month.`
            : "Holding steady.";
    if (away != null && away > 0 && away <= MAX_MONTHS) {
      const d = shift(now, away);
      sentence =
        `${lead} ${milestone === 0 ? "Above zero" : whole(milestone)} by ${MONTHS_SHORT[d.month - 1]} ${d.year}.`.trim();
    } else {
      sentence = lead || `About ${whole(projected)} ${inYears(ahead)}.`;
    }
  }

  // Only what's invested grows; with nothing invested, say so instead.
  const growth =
    mix.invested > 0
      ? `plus investments growing ${ratePercent(outlook.yearlyGrowth)} a year, less ${ratePercent(outlook.inflation)} inflation.`
      : "No growth is counted, since nothing is in Investments.";
  const then = mix.invested > 0 ? ", " : ". ";
  // The monthly amount is a pace, not a deposit: it's how much net worth has
  // been going up, by saving, paying down debt or anything else.
  const assumes =
    plan.source === "falling"
      ? `Assumes it keeps falling as it has the last ${counted} months.`
      : plan.source === "yours"
        ? `Assumes a pace of ${whole(plan.monthly)} a month${then}${growth}`
        : adds
          ? `Your pace: up about ${adds} a month over your last ${counted} months${mix.invested > 0 ? ", not counting growth, " : ". "}${growth}`
          : mix.invested > 0
            ? `Assumes investments growing ${ratePercent(outlook.yearlyGrowth)} a year, less ${ratePercent(outlook.inflation)} inflation.`
            : growth;
  const note = `${assumes} In today’s money. A direction, not a promise.`;

  const dueIndex =
    picked === "goal" && status?.due != null && !late
      ? Math.min(status.due, ahead)
      : null;
  const headline = dueIndex != null ? path[dueIndex] : projected;
  const unit =
    dueIndex != null ? `at your pace by ${status!.dueYear}` : inYears(ahead);
  // Dragging shows the month and amount by the finger; the big number stays.
  const tip = (i: number) => {
    const v = actual[i] ?? forecast[i];
    if (v == null) return null;
    return {
      title: i === nowIndex ? "Today" : shortMonth(shift(shown[0], i)),
      rows: [{ value: whole(v) }],
    };
  };

  return (
    <InsightCard
      label="Where You’re Headed"
      sentence={lock.text(
        sentence,
        "See what your net worth could be in 1 to 30 years, in today’s money, and set a goal like $1M by 50.",
      )}
      {...lock.card}
      note={note}
    >
      <Segmented
        options={options}
        value={picked}
        onChange={setHorizon}
        style={styles.horizon}
      />
      <View style={styles.bigRow}>
        <Text variant="title2" weight="700" rounded tabular numberOfLines={1}>
          {whole(headline)}
        </Text>
        <Text
          variant="subheadline"
          color="secondary"
          numberOfLines={1}
          style={styles.bigUnit}
        >
          {unit}
        </Text>
      </View>
      <Text
        variant="footnote"
        color="secondary"
        style={styles.todays}
      >
        In today’s money
      </Text>
      <TrendKey
        items={[
          { label: "Your net worth", color: c.up },
          {
            label: "At your pace",
            color: c.up,
            dashed: true,
          },
          ...(showGoal
            ? [
                {
                  label: lock.locked ? "Goal" : `${short(status!.target)} goal`,
                  color: c.warning,
                  dashed: true,
                },
              ]
            : !status && away != null && away <= ahead
              ? [
                  {
                    label: lock.locked ? "Next milestone" : whole(milestone),
                    color: c.warning,
                  },
                ]
              : []),
        ]}
      />
      <TrendChart
        count={count}
        height={130}
        series={[
          ...(goalLine
            ? [{ values: goalLine, color: c.warning, dashed: true }]
            : []),
          { values: actual, color: c.up, endDot: true },
          { values: forecast, color: c.up, dashed: true },
        ]}
        marker={marker}
        labels={labels}
        onScrub={lock.locked ? undefined : () => {}}
        tip={tip}
      />
      {status && !late ? (
        <View style={styles.goal}>
          <View style={[styles.goalTrack, { backgroundColor: c.fill }]}>
            <View
              style={[
                styles.goalFill,
                {
                  width: `${Math.max(status.progress * 100, 1.5)}%`,
                  backgroundColor: c.warning,
                },
              ]}
            />
          </View>
          <View style={styles.goalRow}>
            <Text
              variant="footnote"
              color="secondary"
              numberOfLines={1}
              style={styles.goalText}
            >
              {`${lock.locked ? "••" : Math.floor(status.progress * 100)}% of the way to ${short(status.target)}${byWhen ? ` ${byWhen}` : ""}`}
            </Text>
            <GoalLink title="Edit Goal" onPress={() => router.push("/goal")} />
          </View>
        </View>
      ) : (
        <View style={styles.goalRow}>
          <GoalLink
            title={late ? "Pick a New Date" : "Set a Goal"}
            icon="flag"
            onPress={() => router.push("/goal")}
          />
        </View>
      )}
    </InsightCard>
  );
}

/** A small text button inside a card. In the Pro preview it's only a label: the whole card opens Pro. */
function GoalLink({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon?: "flag" | "shield.fill";
  onPress: () => void;
}) {
  const c = useColors();
  const locked = useInsightsPreview();
  // Goals and the fund are set up on their own pages, which change data.
  const guard = useSampleGuard();
  if (locked) {
    return (
      <View style={styles.link}>
        {icon ? (
          <Icon name={icon} size={13} weight="semibold" color={c.tint} />
        ) : null}
        <Text variant="subheadline" weight="600" color="tint">
          {title}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={guard(onPress)}
      hitSlop={10}
      accessibilityRole="button"
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.5 }]}
    >
      {icon ? (
        <Icon name={icon} size={13} weight="semibold" color={c.tint} />
      ) : null}
      <Text variant="subheadline" weight="600" color="tint">
        {title}
      </Text>
    </Pressable>
  );
}

/** Spending data as Insights › Spending counts it. */
function useSpendData() {
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  return { spend, spendCategories };
}

function Spending({ filled }: { filled?: boolean }) {
  const preview = useInsightsPreview();
  const today = useToday();
  const year = parseDateKey(today).y;
  const data = useSpendData();

  const soFar = spentSoFar(data, year, today);
  const creepAll = creepMonths(data, today);
  const history = spendHistory(data, today);
  const sp = spendingYear(data, year, today);
  const chartable = chartableCategories(data, today);
  const cards = useCards([
    lastIndex(soFar) >= 0 ? (
      <SpentYearCard
        key="year"
        year={year}
        soFar={soFar}
        lastYear={spentSoFar(data, year - 1, today)}
      />
    ) : null,
    creepYears(creepAll).length ? <CreepCard key="creep" all={creepAll} /> : null,
    chartable.length ? (
      <CategoryCard key="category" categories={chartable} />
    ) : null,
    // Each of these picks its own year, so they show as long as any year has something.
    spendingYears(data, today).length ? <WhereItWentCard key="where" /> : null,
    <IncomeCard key="income" />,
  ]);

  // Four charts and the income card.
  if (preview && !filled && cards.length < 5) {
    return (
      <SampleData>
        <Spending filled />
      </SampleData>
    );
  }

  if (!sp && !history.length) {
    return (
      <Section footer="Nothing entered in Spending yet.">
        <Row
          title="Open Spending"
          titleColor="tint"
          chevron={false}
          onPress={() => router.navigate("/spending")}
        />
      </Section>
    );
  }
  const fundCard = <EmergencyFundCard />;
  if (!cards.length) {
    return (
      <>
        <InsightCard
          label="This Year vs Last Year"
          sentence="Your year adds up here once a month is over."
        />
        {fundCard}
      </>
    );
  }
  return (
    <>
      {cards}
      {fundCard}
    </>
  );
}

/**
 * How many months of costs the emergency fund covers, as a bar against the
 * goal for your situation, with what's saved, what a month costs and what the
 * goal comes to. Before it's set up, a short question and a Set Up button.
 */
function EmergencyFundCard() {
  const c = useColors();
  const lock = useLock();
  const whole = (cents: number) => lock.money(cents, { whole: true });
  const today = useToday();
  const sample = useContext(SampleContext);
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const real = useEmergencyFund();
  // The sample page and the Pro preview (before it's set up) show a made-up
  // fund, like every other card. A real one can't be read against sample data.
  const made = sample || (!real.fund && lock.locked);
  const fund = made ? sampleFund(today) : real.fund;
  const status = !made
    ? real.status
    : fund
      ? fundStatus(fund, { spend, spendCategories, accounts, snapshots }, today)
      : null;
  const guard = useSampleGuard();
  const edit = guard(() => router.push("/emergency-fund"));

  if (!fund || !status) {
    return (
      <InsightCard
        label="Emergency Fund"
        sentence={
          !fund
            ? "How many months could your savings cover?"
            : fundBalance(fund, { accounts, snapshots }, today) != null
              ? "Add what a month costs you."
              : "Add how much you’ve saved."
        }
        note={
          !fund
            ? "Most people aim for 3 to 6 months of costs, and 9 to 12 if their income varies."
            : null
        }
      >
        <GoalLink
          title={fund ? "Finish Setting Up" : "Set Up"}
          icon="shield.fill"
          onPress={edit}
        />
      </InsightCard>
    );
  }

  const { covered, goal, toGo, balance, target, monthly } = status;
  const linked = status.accounts;
  const max = Math.max(goal * 1.12, covered);
  return (
    <InsightCard
      label="Emergency Fund"
      sentence={lock.text(
        `${formatMonths(covered)} of ${goal} months covered.`,
        "See how many months your savings would cover.",
      )}
      note={`${whole(balance)} ${linked?.length ? `in ${accountNames(linked)}` : "saved"} ÷ ${whole(monthly)} a month, ${
        fund.monthly != null ? "the cost you typed in" : "your average spending over recent months"
      }. ${goal} months is ${whole(target)}.`}
      {...lock.card}
    >
      <View style={[styles.fundBar, { backgroundColor: c.fill }]}>
        <View
          style={[
            styles.fundFill,
            { width: `${Math.min(covered / max, 1) * 100}%`, backgroundColor: c.up },
          ]}
        />
        <View style={[styles.fundTick, { left: `${(goal / max) * 100}%`, backgroundColor: c.secondary }]} />
      </View>
      <Text variant="footnote" color="secondary">
        {toGo > 0
          ? `${whole(toGo)} more reaches ${goal} months.`
          : covered >= goal * 1.05
            ? `Goal reached, with ${whole(balance - target)} extra.`
            : "Goal reached."}
      </Text>
      <View style={styles.fundStats}>
        {[
          ["Saved", whole(balance)],
          ["A Month", whole(monthly)],
          [`${goal} ${goal === 1 ? "Month" : "Months"}`, whole(target)],
        ].map(([label, value]) => (
          <View key={label} style={styles.fundStat}>
            <Text variant="footnote" color="secondary">
              {label}
            </Text>
            <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <GoalLink title="Update" onPress={edit} />
    </InsightCard>
  );
}

/**
 * Spending added up since January, this year against last, with the year's
 * goals once you've set them: a spending limit adds up month by month on the
 * chart, and each goal gets a bar. Like Net Worth's goal, it's set from here.
 */
function SpentYearCard({
  year,
  soFar,
  lastYear,
}: {
  year: number;
  soFar: (number | null)[];
  lastYear: (number | null)[];
}) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const pct = (r: number) => (lock.locked ? "••%" : wholePercent(r));
  const today = useToday();
  const data = useSpendData();
  const goal = useStore((s) => s.settings.spendingGoal);
  // Someone who started partway through the year is counted from their first month, against the same months last year.
  const { from, last, before, then } = compareYears(soFar, lastYear)!;
  const value = soFar[last]!;
  const hasBefore = lastIndex(before) >= 0;
  const editGoals = () => router.push("/spending-goal");

  // With last year to compare, the sentence is only the difference: each
  // year's total is printed on its line. Alone, the sentence carries the total.
  let sentence: string;
  if (then != null) {
    const diff = value - then;
    sentence =
      Math.abs(diff) <= then * 0.03
        ? "About the same as last year."
        : `${whole(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than last year.`;
  } else {
    sentence = `${whole(value)} spent ${from === 0 ? "this year" : from === last ? `in ${MONTHS[last]}` : `since ${MONTHS[from]}`}.`;
  }

  const hidden = useStore((s) => s.settings.hideAmounts);
  const tagged = then != null && !lock.locked && !hidden;
  const g = goal ? yearGoals(data, goal, year, today) : null;
  const said = goal && g ? goalSentence(goal, g, whole) : null;
  if (said) sentence += ` ${said}`;

  const limit = goal?.limit;
  const limitLine =
    limit != null
      ? Array.from({ length: 12 }, (_, i) =>
          i < from ? null : limit * (i - from + 1),
        )
      : null;
  const bars: { key: string; progress: number; color: string; text: string }[] =
    [];
  if (goal?.keep != null && g?.kept != null) {
    bars.push({
      key: "keep",
      progress: g.kept / goal.keep,
      color: g.kept >= goal.keep ? c.up : c.warning,
      text: `Kept ${pct(g.kept)} of what you earned · ${pct(goal.keep)} goal`,
    });
  }
  if (limit != null && g?.spent != null) {
    bars.push({
      key: "limit",
      progress: g.spent / limit,
      color: g.spent > limit ? c.down : c.bar,
      text: `Average month: ${whole(g.spent)} of your ${whole(limit)} limit`,
    });
  }

  const keyItems = [
    { label: `${year}, added up`, color: c.bar },
    ...(hasBefore
      ? [{ label: `${year - 1}, added up`, color: c.tertiary }]
      : []),
    ...(limitLine ? [{ label: "Limit", color: c.warning, dashed: true }] : []),
  ];

  return (
    <InsightCard
      label="This Year vs Last Year"
      sentence={lock.text(
        sentence,
        `See whether you’re spending more or less than you did by this point in ${year - 1}.`,
      )}
      note="Counts each month once it’s over."
      {...lock.card}
    >
      {keyItems.length > 1 ? (
        <TrendKey items={keyItems} />
      ) : null}
      <TrendChart
        count={12}
        series={[
          {
            values: before,
            color: c.tertiary,
            ...(tagged ? { tag: { index: last, text: whole(then!) } } : null),
          },
          ...(limitLine
            ? [{ values: limitLine, color: c.warning, dashed: true }]
            : []),
          {
            values: soFar,
            color: c.bar,
            endDot: true,
            ...(tagged ? { tag: { index: last, text: whole(value) } } : null),
          },
        ]}
        labels={MONTH_LABELS}
        height={tagged ? 160 : undefined}
        onScrub={lock.locked ? undefined : () => {}}
        tip={(i) =>
          soFar[i] == null && before[i] == null
            ? null
            : {
                title: `End of ${MONTHS[i]}`,
                rows: [
                  ...(soFar[i] != null
                    ? [{ label: hasBefore || limitLine ? String(year) : undefined, value: whole(soFar[i]!), color: c.bar }]
                    : []),
                  ...(hasBefore && before[i] != null
                    ? [{ label: String(year - 1), value: whole(before[i]!) }]
                    : []),
                  ...(limitLine && limitLine[i] != null
                    ? [{ label: "Limit", value: whole(limitLine[i]!) }]
                    : []),
                ],
              }
        }
      />
      {goal ? (
        <View style={styles.goals}>
          {bars.map((b, i) => (
            <View key={b.key} style={styles.goal}>
              <View style={[styles.goalTrack, { backgroundColor: c.fill }]}>
                <View
                  style={[
                    styles.goalFill,
                    {
                      width: `${Math.min(100, Math.max(b.progress * 100, 1.5))}%`,
                      backgroundColor: b.color,
                    },
                  ]}
                />
              </View>
              <View style={styles.goalRow}>
                <Text
                  variant="footnote"
                  color="secondary"
                  numberOfLines={1}
                  style={styles.goalText}
                >
                  {b.text}
                </Text>
                {i === bars.length - 1 ? (
                  <GoalLink title="Edit Goals" onPress={editGoals} />
                ) : null}
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
function goalSentence(
  goal: SpendingGoal,
  g: YearGoals,
  whole: (cents: number) => string,
): string | null {
  // The goal bars show where you stand; words only for what to do next.
  const keepOk = goal.keep != null && g.kept != null && g.kept >= goal.keep;
  const over = goal.limit != null && g.spent != null && g.spent > goal.limit;
  if (
    goal.keep != null &&
    g.kept != null &&
    !keepOk &&
    g.keepFromHere != null &&
    g.keepFromHere <= 0.9
  )
    return `Keep ${wholePercent(g.keepFromHere)} from here to hit your goal.`;
  if (over && g.spendFromHere != null && g.spendFromHere > 0)
    return `Spend under ${whole(g.spendFromHere)} a month to get back on track.`;
  // Too far over to make up this year: say so, instead of leaving only the comparison.
  if (over) return "Over your limit for the year.";
  return null;
}

/** "Jan–Jun 2025", or "Nov 2024–Apr 2025" across a new year. */
function monthSpan(from: Month, to: Month): string {
  const a = MONTHS_SHORT[from.month - 1];
  const b = MONTHS_SHORT[to.month - 1];
  if (from.year === to.year && from.month === to.month)
    return `${a} ${to.year}`;
  return from.year === to.year
    ? `${a}–${b} ${to.year}`
    : `${a} ${from.year}–${b} ${to.year}`;
}

/**
 * Lifestyle creep in plain dollars, one year at a time: every month's
 * spending as a bar, with the steady months before the climb faded and the
 * month it started marked, so "about $1,800 a month, then a raise, then up
 * and up" reads at a glance. A row of years picks which year.
 */
function CreepCard({ all }: { all: CreepMonth[] }) {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const whole = (cents: number) => money(cents, { whole: true });
  const hidden = useStore((s) => s.settings.hideAmounts);
  const today = useToday();
  const thisYear = parseDateKey(today).y;
  const years = creepYears(all);
  const [picked, setPicked] = useState<number | null>(null);
  const [at, setAt] = useState<number | null>(null);
  // Locked, it stays on the newest year: the row of years is part of Pro.
  const year = shownYear(years, lock.locked ? null : picked, thisYear);
  const months = creepYear(all, year);
  const creep = lifestyleCreep(months);
  if (!creep) return null;
  const { before, lately, direction, start } = creep;
  const inYear = year === thisYear ? "" : ` in ${year}`;

  const diff = lately.spent - before.spent;
  const sentence =
    direction === "steady" || start == null
      ? `Steady at about ${whole(lately.spent)} a month${inYear}.`
      : `${direction === "up" ? "Up" : "Down"} ${whole(Math.abs(diff))} a month since ${MONTHS[months[start].month - 1]}${year === thisYear ? "" : ` ${year}`}.`;

  const count = months.length;
  const selected = at != null && at < count ? months[at] : null;
  const pick = (y: number) => {
    setPicked(y);
    setAt(null);
  };
  const bars = months.map((m, i) => ({
    value: m.spent ?? 0,
    label: MONTHS_SHORT[m.month - 1][0],
    faded: start != null && i < start,
    accessibilityLabel: `${MONTHS[m.month - 1]} ${m.year}: ${m.spent == null ? "nothing entered" : `spent ${money(m.spent, { whole: true })}`}`,
  }));
  const stats = [
    {
      label: `${start == null ? "Earlier" : "Before"} · ${monthSpan(before.from, before.to)}`,
      value: before.spent,
      color: undefined,
    },
    {
      label: `Lately · ${monthSpan(lately.from, lately.to)}`,
      value: lately.spent,
      color: c.bar,
    },
  ];

  return (
    <InsightCard
      label="Lifestyle Creep"
      sentence={lock.text(
        sentence,
        "See when your spending started to climb, and how much more a month it is now.",
      )}
      {...lock.card}
      note={`Each bar is what you spent that month. Lately is the year’s last three months. Counts each month once it’s over.`}
    >
      {lock.locked ? null : (
        <YearPills years={years} value={year} onChange={pick} />
      )}
      {/* Same height either way, so the chart stays put under a dragging finger. */}
      <View style={styles.creepTop}>
        {selected ? (
          <Readout
            title={`${MONTHS[selected.month - 1]} ${selected.year}`}
            items={
              selected.spent == null
                ? [{ label: "Nothing entered", value: "" }]
                : [
                    {
                      label: "Spent",
                      value: whole(selected.spent),
                      color: c.bar,
                    },
                    ...(selected.earned
                      ? [
                          {
                            label: "Earned",
                            value: whole(selected.earned),
                            color: c.up,
                          },
                        ]
                      : []),
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
                <Text
                  variant="title3"
                  weight="700"
                  rounded
                  tabular
                  numberOfLines={1}
                  style={x.color ? { color: x.color } : null}
                >
                  {whole(x.value)}
                  <Text variant="footnote" weight="500" color="secondary">
                    {" a month"}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <BarChart
        bars={bars}
        marker={
          start != null
            ? {
                index: start,
                label: direction === "up" ? "Climb starts" : "Drop starts",
              }
            : null
        }
        selected={at}
        onSelect={lock.locked ? undefined : setAt}
        formatTick={
          hidden || lock.locked
            ? undefined
            : (v) => money(v, { compact: true, whole: true })
        }
        height={150}
      />
    </InsightCard>
  );
}

/**
 * One category at a time, month by month for a year, like Screen Time's
 * daily bars: eating out at $150 in January and $500 by October shows at a
 * glance. Pills pick the category and the year; every month it has is a tap
 * away.
 */
function CategoryCard({ categories }: { categories: SpendCategory[] }) {
  const lock = useLock();
  const money = lock.money;
  const groupColor = useGroupColor();
  const today = useToday();
  const thisYear = parseDateKey(today).y;
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const category = categories.find((x) => x.id === picked) ?? categories[0];
  const whole = (cents: number) => money(cents, { whole: true });

  const all = categoryMonths({ spend, spendCategories }, category.id, today);
  const perYear = categoryYears(all);
  const years = perYear.map((y) => y.year).reverse();
  // Locked, it stays on the newest year: the row of years is part of Pro.
  const year = shownYear(years, lock.locked ? null : pickedYear, thisYear);
  const months = categoryYearMonths(all, year);
  const average = averageOf(months);
  const prev = perYear.find((y) => y.year === year - 1)?.monthly;
  let sentence: string;
  if (average == null) {
    sentence = `Nothing entered for ${category.name} yet.`;
  } else {
    const said = `${whole(average)} a month ${year === thisYear ? "this year" : `in ${year}`}`;
    if (prev == null) sentence = `${said}.`;
    else if (average === prev || (prev > 0 && Math.abs(average / prev - 1) < 0.05))
      sentence = `${said}, same as ${year - 1}.`;
    else
      sentence = `${said}, ${average > prev ? "up" : "down"} ${whole(Math.abs(average - prev))} from ${year - 1}.`;
  }
  const pick = (id: string) => {
    setPicked(id);
    setAt(null);
  };
  const pickYear = (y: number) => {
    setPickedYear(y);
    setAt(null);
  };
  const open = () =>
    router.push({
      pathname: "/insights/category",
      params: { id: category.id },
    });
  const selected = at != null ? months[at] : null;
  const verb = category.group === "income" ? "Earned" : "Spent";

  return (
    <InsightCard
      label="By Category"
      sentence={lock.text(
        sentence,
        "See how each category, like eating out or rent, changes month to month.",
      )}
      note="Compares the year’s average month with the year before. Counts each month once it’s over."
      {...lock.card}
    >
      <CategoryPills
        categories={categories}
        value={category.id}
        onChange={pick}
        locked={lock.locked}
      />
      {lock.locked ? null : (
        <YearPills years={years} value={year} onChange={pickYear} />
      )}
      {selected ? (
        <Readout
          title={`${MONTHS[selected.month - 1]} ${selected.year}`}
          items={[
            {
              label: verb,
              value:
                selected.value == null
                  ? "Nothing entered"
                  : whole(selected.value),
            },
          ]}
        />
      ) : (
        <Readout
          title={String(year)}
          items={
            average != null
              ? [{ label: "Average", value: `${whole(average)}/mo` }]
              : []
          }
        />
      )}
      <BarChart
        bars={categoryBars(months, money)}
        color={groupColor(category.group)}
        average={average}
        selected={at}
        onSelect={lock.locked ? undefined : setAt}
        formatTick={
          hidden || lock.locked
            ? undefined
            : (v) => money(v, { compact: true, whole: true })
        }
        height={130}
      />
      <View style={[styles.goalRow, styles.more]}>
        <GoalLink title="See Every Month" onPress={open} />
      </View>
    </InsightCard>
  );
}

/** What came in this year, by source. Nothing to show without income entered. */
function IncomeCard() {
  const lock = useLock();
  const today = useToday();
  const thisYear = parseDateKey(today).y;
  const data = useSpendData();
  const years = incomeYears(data, today);
  const [picked, setPicked] = useState<number | null>(null);
  // Locked, it stays on the newest year: the row of years is part of Pro.
  const year = shownYear(years, lock.locked ? null : picked, thisYear);
  return (
    <IncomeSources
      totals={categoryTotals(data, year, ["income"])}
      when={year === thisYear ? "this year" : `in ${year}`}
      money={lock.money}
      sentence={lock.text}
      card={lock.card}
      masked={lock.locked}
      years={
        lock.locked ? null : (
          <YearPills years={years} value={year} onChange={setPicked} />
        )
      }
    />
  );
}

/**
 * A year's biggest spending categories, with the full list a tap away. A row
 * of years, when there's more than one, shows any of them, each against the
 * year before it.
 */
function WhereItWentCard() {
  const c = useColors();
  const lock = useLock();
  const money = lock.money;
  const today = useToday();
  const data = useSpendData();
  const whole = (cents: number) => money(cents, { whole: true });
  const signed = (cents: number) => money(cents, { signed: true, whole: true });
  const thisYear = parseDateKey(today).y;
  const years = spendingYears(data, today);
  const [picked, setPicked] = useState<number | null>(null);
  // Locked, it stays on the newest year: the row of years is part of Pro.
  const year = shownYear(years, lock.locked ? null : picked, thisYear);
  const sp = spendingYear(data, year, today);
  const spBefore = spendingYear(data, year - 1, today);
  // Only drawn when some year has spending, and `year` is one of those.
  const top = sp?.categories[0];
  if (!sp || !top) return null;
  // The year before needs spending of its own: with only income entered, everything would read as new.
  const canCompare = !!spBefore?.categories.length && sp.months >= 2 && spBefore.months >= 2;
  const when = year === thisYear ? "this year" : `in ${year}`;
  const lastYearMonthly = new Map(
    spBefore?.categories.map((x) => [x.category.id, x.monthly]) ?? [],
  );
  return (
    <InsightCard
      label="Where It Went"
      sentence={lock.text(
        `${top.category.name} took ${formatPercent(top.share)} of your spending ${when}.`,
        "See every category a month on average, and how each compares with last year.",
      )}
      note={
        canCompare
          ? `Under each is how much more or less that is a month than in ${year - 1}.`
          : "Under each is its share of your spending."
      }
      onPress={() =>
        router.push({
          pathname: "/insights/where-it-went",
          params: { year: String(year) },
        })
      }
      {...lock.card}
    >
      {lock.locked ? null : (
        <YearPills years={years} value={year} onChange={setPicked} />
      )}
      {sp.categories.slice(0, 5).map((x) => {
        const change = canCompare
          ? x.monthly - (lastYearMonthly.get(x.category.id) ?? 0)
          : null;
        return (
          <RankRow
            key={x.category.id}
            title={x.category.name}
            value={`${whole(x.monthly)}/mo`}
            share={x.share / top.share}
            color={c.bar}
            note={
              lock.locked
                ? MASK
                : change == null
                  ? formatPercent(x.share)
                  : roundsToZero(change)
                    ? `Same as ${year - 1}`
                    : `${signed(change)} vs ${year - 1}`
            }
            // Spending more is the bad direction.
            noteColor={
              lock.locked || change == null || roundsToZero(change)
                ? "secondary"
                : change > 0
                  ? "down"
                  : "up"
            }
          />
        );
      })}
    </InsightCard>
  );
}

/** What's under the finger, in place of the chart's key while dragging. */
function Readout({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string; color?: string }[];
}) {
  return (
    <View style={styles.readout}>
      <Text variant="footnote" weight="600" numberOfLines={1}>
        {title}
      </Text>
      {items.map((it) => (
        <Text
          key={it.label}
          variant="footnote"
          color="secondary"
          numberOfLines={1}
        >
          {`${it.label} `}
          <Text
            variant="footnote"
            weight="600"
            tabular
            color={it.color ?? "text"}
          >
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
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
  },
  mixList: {
    marginTop: 16,
    gap: 8,
  },
  mixRow: {
    flexDirection: "row",
    alignItems: "center",
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
    textAlign: "right",
  },
  mixValue: {
    minWidth: 92,
    textAlign: "right",
  },
  bigUnit: {
    flexShrink: 1,
    marginLeft: 5,
  },
  todays: {
    marginTop: -6,
    marginBottom: 10,
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
    overflow: "hidden",
  },
  goalFill: {
    height: 6,
    borderRadius: 3,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  goalText: {
    flex: 1,
  },
  more: {
    marginTop: 12,
  },
  fundBar: {
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    marginBottom: 8,
  },
  fundFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
  },
  fundStats: {
    flexDirection: "row",
    marginTop: 12,
    marginBottom: 10,
    gap: 12,
  },
  fundStat: {
    flex: 1,
    gap: 1,
  },
  fundTick: {
    position: "absolute",
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  creepTop: {
    minHeight: 58,
  },
  creepStats: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  creepStat: {
    flex: 1,
    gap: 2,
  },
  readout: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 10,
  },
});
