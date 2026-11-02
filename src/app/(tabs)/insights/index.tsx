import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { ChangeBars } from '@/components/change-bars';
import { EmptyState } from '@/components/empty-state';
import { CompareBars, InsightCard, RankRow } from '@/components/insight-card';
import { PreviewFooter, useInsightsPreview } from '@/components/insights-preview';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Stepper } from '@/components/stepper';
import { useTabButtons } from '@/components/tab-buttons';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { MONTHS, MONTHS_SHORT, parseDateKey } from '@/lib/dates';
import {
  average,
  categoryChangesBetween,
  debtBetween,
  finishedMonths,
  firstYear,
  holdingsOn,
  monthsLabel,
  monthsSpan,
  netWorthMonths,
  netWorthYear,
  recentMonths,
  spendingMonths,
  spendingYear,
  yearSpan,
  type CategoryChange,
  type Month,
} from '@/lib/insights';
import { formatPercent } from '@/lib/money';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';

type Part = 'networth' | 'spending';
const PARTS: { value: Part; label: string }[] = [
  { value: 'networth', label: 'Net Worth' },
  { value: 'spending', label: 'Spending' },
];

/**
 * A year in short findings, each a sentence and a chart, with Net Worth and
 * Spending one tap apart so neither is a long scroll. Net worth findings come
 * only from balances and spending findings only from Spending, so neither is
 * thrown off by how much of the other tracker is filled in. As a preview, it
 * shows the last two whole months instead of years.
 */
export default function InsightsScreen() {
  const tabButtons = useTabButtons();
  const preview = useInsightsPreview();
  const today = useToday();
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const now = parseDateKey(today);
  const [part, setPart] = useState<Part>('networth');
  const [year, setYear] = useState(now.y);

  const first = firstYear({ snapshots, spend });
  if (first == null) {
    return (
      <Screen title="Insights" large left={tabButtons}>
        <EmptyState
          icon="chart.pie"
          title="See the bigger picture"
          message="Once you’ve added accounts or entered a month of spending, this page shows how your net worth and spending change over time."
        />
        <PreviewFooter />
      </Screen>
    );
  }

  const months = preview ? recentMonths(today) : null;
  return (
    <Screen title="Insights" large left={tabButtons}>
      <Segmented options={PARTS} value={part} onChange={setPart} style={styles.parts} />
      {months ? (
        <View style={styles.period}>
          <Text variant="headline" align="center">
            {monthsLabel(months)}
          </Text>
        </View>
      ) : (
        <Stepper
          label={String(year)}
          onPrev={() => setYear((y) => y - 1)}
          onNext={() => setYear((y) => y + 1)}
          canPrev={year > first}
          canNext={year < now.y}
          prevLabel="Previous year"
          nextLabel="Next year"
        />
      )}
      {part === 'networth' ? <NetWorth key={year} year={year} months={months} /> : <Spending year={year} months={months} />}
      <PreviewFooter />
    </Screen>
  );
}

/** "this year", "in 2025", or "in September and October". */
function periodWords(year: number, months: Month[] | null, today: string) {
  const isThisYear = !months && year === parseDateKey(today).y;
  return {
    isThisYear,
    when: months ? `in ${monthsLabel(months)}` : isThisYear ? 'this year' : `in ${year}`,
    before: isThisYear ? 'last year' : `in ${year - 1}`,
  };
}

/** Months of a run that have figures, latest first, for two-bar comparisons. */
function latestFirst<T>(months: Month[], values: (T | null)[]): { month: Month; value: T }[] {
  return months.flatMap((month, i) => (values[i] != null ? [{ month, value: values[i] as T }] : [])).reverse();
}

const monthName = (m: Month) => MONTHS[m.month - 1];

function NetWorth({ year, months }: { year: number; months: Month[] | null }) {
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const now = parseDateKey(today);
  const [month, setMonth] = useState<number | null>(null);
  const whole = (cents: number) => money(cents, { whole: true });
  const signed = (cents: number) => money(cents, { signed: true, whole: true });
  const { isThisYear, when, before: lastYear } = periodWords(year, months, today);

  const data = { accounts, snapshots, nwCategories };
  const span = months ? monthsSpan(months, today) : yearSpan(year, today);
  const nw = months ? netWorthMonths(data, months, today) : netWorthYear(data, year, today);
  const categories = span ? categoryChangesBetween(data, span) : [];
  const debt = span ? debtBetween(data, span) : null;
  const holdings = span ? holdingsOn(data, span.to) : null;

  // A year's months; a preview's two months are compared side by side instead.
  const done = nw && !months ? finishedMonths(nw, year, today) : [];
  const perMonth = average(done.map((m) => m.change));
  const before = months ? null : netWorthYear(data, year - 1, today);
  const beforeMonths = before ? finishedMonths(before, year - 1, today) : [];
  const perMonthBefore = average(beforeMonths.map((m) => m.change));
  const best = done.reduce<(typeof done)[number] | null>((b, m) => (!b || m.change > b.change ? m : b), null);
  const picked = month != null && nw ? nw.months[month] : null;
  const recent = months && nw ? latestFirst(months, nw.months) : [];
  const canComparePace = perMonth != null && perMonthBefore != null && done.length >= 2 && beforeMonths.length >= 2;

  // Nothing to compare yet: balances entered just now, or (in the preview) only after its months.
  const nothingYet = nw
    ? nw.change === 0 && (months ? recent.every((m) => m.value.change === 0) : done.length === 0)
    : months != null && snapshots.length > 0;
  if (nothingYet) {
    return (
      <InsightCard
        label="Growth"
        sentence="Update your balances over the next few months to see how your net worth changes."
      />
    );
  }
  if (!nw) {
    return (
      <Section footer={`No balances entered by the end of ${months ? monthName(months[months.length - 1]) : year}.`}>
        {accounts.length === 0 ? (
          <Row title="Add an Account" titleColor="tint" chevron={false} onPress={() => router.push('/account-form')} />
        ) : null}
      </Section>
    );
  }

  const pct = nw.ratio != null && nw.start > 0 ? formatPercent(Math.abs(nw.ratio)) : null;
  let growth =
    nw.change > 0
      ? `Your net worth grew ${whole(nw.change)} ${when}${pct ? `, up ${pct}` : ''}.`
      : nw.change < 0
        ? `Your net worth fell ${whole(-nw.change)} ${when}${pct ? `, down ${pct}` : ''}.`
        : `Your net worth didn’t change ${when}.`;
  if (perMonth != null && done.length >= 2 && Math.sign(perMonth) === Math.sign(nw.change)) {
    growth += ` That’s about ${whole(Math.abs(perMonth))} a month.`;
  }

  return (
    <>
      {months ? (
        <InsightCard label="Growth" sentence={growth}>
          {recent.length >= 2 ? (
            <CompareBars
              bars={recent.map((r, i) => ({
                label: monthName(r.month),
                value: r.value.change,
                text: signed(r.value.change),
                color: i === 0 ? (r.value.change >= 0 ? c.up : c.down) : undefined,
              }))}
            />
          ) : null}
        </InsightCard>
      ) : (
        <InsightCard
          label="Growth"
          sentence={growth}
          note={
            picked
              ? `${MONTHS[month!]}${isThisYear && month! + 1 === now.m ? ' so far' : ''}: ${signed(picked.change)}`
              : best && done.length >= 2 && best.change > 0
                ? `Best month: ${MONTHS[best.month]}, ${signed(best.change)}`
                : null
          }>
          <ChangeBars
            bars={nw.months.map((m, i) => ({
              value: m ? m.change : null,
              label: MONTHS_SHORT[i][0],
              accessibilityLabel: m ? `${MONTHS[i]}: ${signed(m.change)}` : `${MONTHS[i]}: no balances`,
            }))}
            height={96}
            selected={month}
            onSelect={setMonth}
          />
        </InsightCard>
      )}

      {canComparePace ? (
        <InsightCard
          label={`Compared with ${year - 1}`}
          sentence={paceSentence(perMonth!, perMonthBefore!, when, lastYear)}
          note="The average change in a month.">
          <CompareBars
            bars={[
              {
                label: String(year),
                value: perMonth!,
                text: signed(perMonth!),
                unit: 'a month',
                color: perMonth! >= 0 ? c.up : c.down,
              },
              { label: String(year - 1), value: perMonthBefore!, text: signed(perMonthBefore!), unit: 'a month' },
            ]}
          />
        </InsightCard>
      ) : null}

      {categories.length >= 2 ? (
        <InsightCard
          label="By Category"
          sentence={categorySentence(categories, when)}
          note={categories.some((x) => x.category.kind === 'liability') ? 'Paying down a debt counts as growth here.' : null}>
          {pickBiggest(categories, 5).map((x) => (
            <RankRow
              key={x.category.id}
              title={x.category.name}
              value={signed(x.change)}
              valueColor={x.change > 0 ? 'up' : 'down'}
              share={Math.abs(x.change) / Math.max(...categories.map((y) => Math.abs(y.change)))}
              color={x.change > 0 ? c.up : c.down}
            />
          ))}
        </InsightCard>
      ) : null}

      {debt ? (
        <InsightCard
          label="Debt"
          sentence={debtSentence(debt, whole, when)}
          note={
            holdings && holdings.assetTotal > 0 && holdings.debtTotal > 0
              ? `What you owe is ${formatPercent(holdings.debtTotal / holdings.assetTotal)} of what you own.`
              : null
          }>
          <CompareBars
            bars={[
              {
                label: months ? `End of ${monthName(months[months.length - 1])}` : isThisYear ? 'Today' : `End of ${year}`,
                value: debt.end,
                text: whole(debt.end),
                color: c.down,
              },
              {
                label: months ? `Start of ${monthName(months[0])}` : `Start of ${year}`,
                value: debt.start,
                text: whole(debt.start),
              },
            ]}
          />
        </InsightCard>
      ) : null}
    </>
  );
}

function Spending({ year, months }: { year: number; months: Month[] | null }) {
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const whole = (cents: number) => money(cents, { whole: true });
  const signed = (cents: number) => money(cents, { signed: true, whole: true });
  const { when, before: lastYear } = periodWords(year, months, today);

  const data = { spend, spendCategories };
  const sp = months ? spendingMonths(data, months) : spendingYear(data, year, today);
  const spBefore = months ? null : spendingYear(data, year - 1, today);
  const canCompare = !!sp && !!spBefore && sp.months >= 2 && spBefore.months >= 2;
  const canCompareRate = canCompare && sp!.rate != null && spBefore!.rate != null;
  const lastYearMonthly = new Map(spBefore?.categories.map((x) => [x.category.id, x.monthly]) ?? []);

  if (!sp) {
    return (
      <Section footer={`Nothing entered in Spending for ${months ? monthsLabel(months) : year}.`}>
        <Row title="Open Spending" titleColor="tint" chevron={false} onPress={() => router.navigate('/spending')} />
      </Section>
    );
  }

  const spent = months ? latestFirst(months, sp.spent) : [];
  const rates = months ? latestFirst(months, sp.rates) : [];
  const top = sp.categories[0];

  return (
    <>
      {months ? (
        <InsightCard
          label="Spent"
          sentence={
            spent.length >= 2
              ? monthSpendSentence(spent[0].value, spent[1].value, monthName(spent[0].month), monthName(spent[1].month))
              : `You spent ${whole(spent[0].value)} in ${monthName(spent[0].month)}.`
          }>
          {spent.length >= 2 ? (
            <CompareBars
              bars={spent.map((s, i) => ({
                label: monthName(s.month),
                value: s.value,
                text: whole(s.value),
                color: i === 0 ? c.bar : undefined,
              }))}
            />
          ) : null}
        </InsightCard>
      ) : (
        <InsightCard
          label="Average Month"
          sentence={
            canCompare
              ? spendSentence(sp.monthly, spBefore!.monthly, when, lastYear)
              : `You spent ${whole(sp.monthly)} a month on average ${when}.`
          }>
          {canCompare ? (
            <CompareBars
              bars={[
                { label: String(year), value: sp.monthly, text: whole(sp.monthly), unit: 'a month', color: c.bar },
                { label: String(year - 1), value: spBefore!.monthly, text: whole(spBefore!.monthly), unit: 'a month' },
              ]}
            />
          ) : (
            <BarChart
              bars={sp.spent.map((v, i) => ({
                value: v ?? 0,
                label: MONTHS_SHORT[i][0],
                accessibilityLabel: v != null ? `${MONTHS[i]}: spent ${whole(v)}` : `${MONTHS[i]}: not counted`,
              }))}
              height={110}
              average={sp.months >= 2 ? sp.monthly : null}
              formatTick={hidden ? undefined : (v) => money(v, { compact: true, whole: true })}
            />
          )}
        </InsightCard>
      )}

      {sp.rate != null ? (
        <InsightCard
          label="Savings Rate"
          sentence={
            months && rates.length >= 2
              ? rateSentence(
                  rates[0].value,
                  rates[1].value,
                  `in ${monthName(rates[0].month)}`,
                  `in ${monthName(rates[1].month)}`,
                )
              : canCompareRate
                ? rateSentence(sp.rate, spBefore!.rate!, when, lastYear)
                : keptSentence(sp.rate, months && rates.length ? `in ${monthName(rates[0].month)}` : when)
          }
          note="What you didn’t spend, out of what you earned.">
          {months ? (
            rates.length >= 2 ? (
              <CompareBars
                bars={rates.map((r, i) => ({
                  label: monthName(r.month),
                  value: r.value,
                  text: formatPercent(r.value),
                  color: i === 0 ? (r.value >= 0 ? c.up : c.down) : undefined,
                }))}
              />
            ) : null
          ) : canCompareRate ? (
            <CompareBars
              bars={[
                { label: String(year), value: sp.rate, text: formatPercent(sp.rate), color: sp.rate >= 0 ? c.up : c.down },
                { label: String(year - 1), value: spBefore!.rate!, text: formatPercent(spBefore!.rate!) },
              ]}
            />
          ) : sp.months >= 2 ? (
            <ChangeBars
              bars={sp.rates.map((r, i) => ({
                value: r,
                label: MONTHS_SHORT[i][0],
                accessibilityLabel: r != null ? `${MONTHS[i]}: kept ${formatPercent(r)}` : `${MONTHS[i]}: no income`,
              }))}
              height={84}
            />
          ) : null}
        </InsightCard>
      ) : null}

      {top ? (
        <InsightCard
          label="Where It Went"
          sentence={`${top.category.name} took the biggest share of your spending ${when}, ${formatPercent(top.share)}.`}
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
      ) : null}
    </>
  );
}

/** "Your net worth grew faster this year than last year", from the average month of each. */
function paceSentence(now: number, before: number, thisYear: string, lastYear: string): string {
  if (now >= 0 && before >= 0) {
    if (Math.abs(now - before) <= 0.05 * Math.max(now, before)) {
      return `Your net worth grew about as fast ${thisYear} as ${lastYear}.`;
    }
    return now > before
      ? `Your net worth grew faster ${thisYear} than ${lastYear}.`
      : `Your net worth grew more slowly ${thisYear} than ${lastYear}.`;
  }
  if (now < 0 && before >= 0) return `Your net worth fell ${thisYear}, after growing ${lastYear}.`;
  if (now >= 0 && before < 0) return `Your net worth grew ${thisYear}, after falling ${lastYear}.`;
  return now < before
    ? `Your net worth fell faster ${thisYear} than ${lastYear}.`
    : `Your net worth fell more slowly ${thisYear} than ${lastYear}.`;
}

/** The category that moved net worth the most, in plain words. */
function categorySentence(list: CategoryChange[], when: string): string {
  const top = list[0];
  if (top.change > 0) {
    return top.category.kind === 'liability'
      ? `Paying down ${top.category.name} helped the most ${when}.`
      : `${top.category.name} grew the most ${when}.`;
  }
  const worst = list[list.length - 1];
  return worst.category.kind === 'liability'
    ? `${worst.category.name} went up the most ${when}.`
    : `${worst.category.name} fell the most ${when}.`;
}

/** The biggest movers either way, kept in order from most added to most taken away. */
function pickBiggest<T extends { change: number }>(list: T[], count: number): T[] {
  const keep = new Set([...list].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, count));
  return list.filter((x) => keep.has(x));
}

function debtSentence(debt: { start: number; end: number }, whole: (cents: number) => string, when: string): string {
  if (debt.end < debt.start) {
    return debt.end === 0
      ? `You paid off all your debt ${when}.`
      : `You paid down ${whole(debt.start - debt.end)} of debt ${when}.`;
  }
  if (debt.end > debt.start) return `Your debt grew ${whole(debt.end - debt.start)} ${when}.`;
  return `Your debt didn’t change ${when}.`;
}

function spendSentence(now: number, before: number, thisYear: string, lastYear: string): string {
  if (Math.abs(now - before) <= 0.03 * before) return `You spent about the same each month ${thisYear} as ${lastYear}.`;
  return now < before
    ? `You spent less each month ${thisYear} than ${lastYear}.`
    : `You spent more each month ${thisYear} than ${lastYear}.`;
}

function monthSpendSentence(now: number, before: number, month: string, monthBefore: string): string {
  if (Math.abs(now - before) <= 0.03 * before) return `You spent about the same in ${month} as in ${monthBefore}.`;
  return now < before
    ? `You spent less in ${month} than in ${monthBefore}.`
    : `You spent more in ${month} than in ${monthBefore}.`;
}

function rateSentence(now: number, before: number, when: string, whenBefore: string): string {
  if (Math.abs(now - before) < 0.005) {
    return `You kept about the same share of what you earned ${when} as ${whenBefore}.`;
  }
  return now > before
    ? `You kept more of what you earned ${when} than ${whenBefore}.`
    : `You kept less of what you earned ${when} than ${whenBefore}.`;
}

function keptSentence(rate: number, when: string): string {
  return rate >= 0
    ? `You kept ${formatPercent(rate)} of what you earned ${when}.`
    : `You spent ${formatPercent(-rate)} more than you earned ${when}.`;
}

const styles = StyleSheet.create({
  parts: {
    marginTop: 4,
    marginBottom: 10,
  },
  period: {
    height: 32,
    justifyContent: 'center',
    marginHorizontal: layout.margin,
    marginTop: 4,
    marginBottom: 6,
  },
});
