import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { BigAmountInput } from '@/components/big-amount-input';
import { Row, Section } from '@/components/list';
import { MiniStepper, percentSteps } from '@/components/mini-stepper';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { parseDateKey } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import { centsToInput, formatTyping, parseAmount } from '@/lib/money';
import { goalStatus, inFutureMoney, makePlan, monthlyRate, ratePercent, type Plan } from '@/lib/outlook';
import { netWorthHistory, netWorthPace, shift } from '@/lib/trends';
import type { NetWorthGoal, Outlook } from '@/lib/types';
import { useStore } from '@/store';
import { type, useColors } from '@/theme';

type When = 'none' | 'year' | 'age';
const WHEN: { value: When; label: string }[] = [
  { value: 'none', label: 'No Date' },
  { value: 'year', label: 'By a Year' },
  { value: 'age', label: 'By an Age' },
];
const RATES = percentSteps(0.1);

/** Nearest $10, for amounts that are estimates anyway. */
const roughly = (cents: number) => Math.round(cents / 1000) * 1000;

/**
 * Set a net worth goal, in today's money, with or without a date (a year, or
 * an age), and the assumptions Where You're Headed uses: inflation, growth on
 * top of it, and what you add each month. A summary shows where you stand as
 * you type.
 */
export default function GoalScreen() {
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const big = (cents: number) => money(cents, { whole: true, compact: Math.abs(cents) >= 1_000_000_00 });
  const today = useToday();
  const thisYear = parseDateKey(today).y;
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const saved = useStore((s) => s.settings.goal);
  const savedBirthYear = useStore((s) => s.settings.birthYear);
  const outlook = useStore((s) => s.settings.outlook);
  const updateSettings = useStore((s) => s.updateSettings);

  const [amount, setAmount] = useState(saved ? formatTyping(centsToInput(saved.amount)) : '');
  const [when, setWhen] = useState<When>(saved?.age != null ? 'age' : saved?.year != null ? 'year' : 'none');
  const [year, setYear] = useState(String(saved?.year ?? thisYear + 10));
  const [age, setAge] = useState(saved?.age != null ? String(saved.age) : '');
  const [born, setBorn] = useState(savedBirthYear != null ? String(savedBirthYear) : '');
  const [inflation, setInflation] = useState(outlook.inflation);
  const [growth, setGrowth] = useState(outlook.growth);
  const [monthly, setMonthly] = useState<number | null>(outlook.monthly ?? null);

  const target = parseAmount(amount) ?? 0;
  const yearNum = Number(year);
  const ageNum = Number(age);
  const bornNum = Number(born);
  const bornOk = /^\d{4}$/.test(born) && bornNum >= 1900 && bornNum <= thisYear;
  const yearOk = /^\d{4}$/.test(year) && yearNum >= thisYear && yearNum <= thisYear + 80;
  const ageOk = /^\d{1,3}$/.test(age) && bornOk && bornNum + ageNum >= thisYear && bornNum + ageNum <= thisYear + 80;
  const dateOk = when === 'none' || (when === 'year' ? yearOk : ageOk);
  const draft: NetWorthGoal | null =
    target > 0 && dateOk
      ? { amount: target, ...(when === 'year' ? { year: yearNum } : when === 'age' ? { age: ageNum } : null) }
      : null;
  // An empty amount saves the assumptions alone, with no goal.
  const canSave = amount === '' || draft != null;

  const history = netWorthHistory({ accounts, snapshots, nwCategories }, today);
  const now = history.length ? history[history.length - 1] : null;
  const current = now?.end ?? 0;
  const pace = netWorthPace(history)?.perMonth ?? null;
  const draftOutlook: Outlook = { inflation, growth, ...(monthly != null ? { monthly } : null) };
  const plan = makePlan(current, pace, draftOutlook);
  const estimate = makePlan(current, pace, { inflation, growth });
  const birth = when === 'age' && bornOk ? bornNum : undefined;
  const status = draft && now ? goalStatus(draft, birth, current, plan, monthlyRate(growth), now.year, now.month) : null;

  const save = () => {
    if (!canSave) return;
    updateSettings({
      goal: draft ?? undefined,
      ...(when === 'age' && bornOk ? { birthYear: bornNum } : null),
      outlook: draftOutlook,
    });
    router.back();
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Remove your goal?', confirmLabel: 'Remove Goal', destructive: true });
    if (!ok) return;
    updateSettings({ goal: undefined });
    router.back();
  };

  const dueYear = status?.dueYear ?? null;

  return (
    <Screen
      form
      title="Net Worth Goal"
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', disabled: !canSave, onPress: save }]}>
      <BigAmountInput text={amount} onChangeText={setAmount} placeholder="1,000,000" autoFocus={!saved} />
      <Text variant="footnote" color="secondary" align="center" style={styles.caption}>
        In today’s money: what it would buy now
      </Text>

      <Section
        header="Reach It"
        footer={
          when === 'year'
            ? yearOk
              ? `By the end of ${yearNum}.`
              : `Enter a year from ${thisYear} on.`
            : when === 'age'
              ? !bornOk
                ? 'Enter the year you were born, to count your age.'
                : ageOk
                  ? `By the end of ${bornNum + ageNum}, the year you turn ${ageNum}.`
                  : 'Enter an age you haven’t reached yet.'
              : 'Without a date, Plainworth shows when you’d get there.'
        }>
        <Row
          title={<Segmented options={WHEN} value={when} onChange={setWhen} style={styles.segmented} />}
        />
        {when === 'year' ? (
          <Row title="Year" accessory={<NumberInput value={year} onChange={setYear} placeholder={String(thisYear + 10)} />} />
        ) : null}
        {when === 'age' ? (
          <Row title="Born In" accessory={<NumberInput value={born} onChange={setBorn} placeholder="1990" />} />
        ) : null}
        {when === 'age' ? (
          <Row title="Age" accessory={<NumberInput value={age} onChange={setAge} placeholder="50" digits={3} />} />
        ) : null}
      </Section>

      {status && now ? (
        <Section
          header="Where You Stand"
          footer={
            dueYear != null && status.due != null
              ? `With prices rising ${ratePercent(inflation)} a year, ${big(target)} today is about ${big(inFutureMoney(target, inflation, status.due))} in ${dueYear}. Plainworth counts that for you.`
              : `Your goal stays in today’s money: as prices rise, Plainworth counts that for you.`
          }>
          <Row
            title="You Have"
            value={whole(current)}
            detail={status.progress >= 1 ? 'Goal reached' : `${Math.floor(status.progress * 100)}% of the way`}
          />
          {status.progress < 1 ? (
            <Row
              title="At Your Pace"
              value={
                status.reachIn != null
                  ? String(shift(now, status.reachIn).year)
                  : plan
                    ? 'Over 50 years'
                    : '—'
              }
              detail={
                status.reachIn != null && birth != null
                  ? `At ${shift(now, status.reachIn).year - birth}`
                  : status.reachIn != null
                    ? `In about ${Math.max(1, Math.round(status.reachIn / 12))} ${Math.round(status.reachIn / 12) <= 1 ? 'year' : 'years'}`
                    : undefined
              }
            />
          ) : null}
          {status.needed != null && status.due != null ? (
            <Row
              title={when === 'age' ? `To Make It by Age ${ageNum}` : `To Make It by ${dueYear}`}
              value={`${whole(roughly(status.needed))}/mo`}
              detail={plan && plan.monthly > 0 ? `You add about ${whole(roughly(plan.monthly))}` : undefined}
            />
          ) : null}
        </Section>
      ) : null}

      <Section header="Assumptions" footer={assumptionsNote(growth, inflation, estimate)}>
        <Row
          title="You Add Each Month"
          subtitle={monthly != null ? 'Your number' : estimate ? 'Worked out from your pace' : 'Enter what you save'}
          accessory={
            <AmountInput
              value={monthly}
              onChange={setMonthly}
              placeholder={estimate ? whole(roughly(estimate.monthly)) : '$0'}
              accessibilityLabel="What you add each month"
            />
          }
        />
        {monthly != null && estimate ? (
          <Row title="Work It Out From My Pace" titleColor="tint" chevron={false} onPress={() => setMonthly(null)} />
        ) : null}
        <Row
          title="Growth"
          subtitle="On top of inflation"
          accessory={
            <MiniStepper value={growth} options={RATES} onChange={setGrowth} format={ratePercent} accessibilityLabel="growth" />
          }
        />
        <Row
          title="Inflation"
          accessory={
            <MiniStepper
              value={inflation}
              options={RATES}
              onChange={setInflation}
              format={ratePercent}
              accessibilityLabel="inflation"
            />
          }
        />
      </Section>

      {saved ? (
        <Section>
          <Row title="Remove Goal" titleColor="down" centered onPress={remove} />
        </Section>
      ) : null}
      <Text variant="footnote" color="secondary" style={styles.bottom}>
        Where You’re Headed uses these too, goal or not.
      </Text>
    </Screen>
  );
}

function assumptionsNote(growth: number, inflation: number, estimate: Plan | null): string {
  const before = Math.round(((1 + growth) * (1 + inflation) - 1) * 100);
  return (
    `${ratePercent(growth)} growth on top of ${ratePercent(inflation)} inflation is about ${before}% a year before inflation. ` +
    'Lower it if much of what you own is cash or a home. ' +
    (estimate
      ? 'What you add each month is worked out from your pace: what your net worth went up in an average month, less what your money would have earned. Type your own if you know it.'
      : 'Once you’ve updated your balances for a couple of months, Plainworth can work this out from your pace.')
  );
}

/** A right-aligned number field for a list row, like a year or an age. */
function NumberInput({
  value,
  onChange,
  placeholder,
  digits = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  digits?: number;
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, digits))}
      placeholder={placeholder}
      placeholderTextColor={c.tertiary}
      keyboardType="number-pad"
      maxLength={digits}
      style={[styles.number, { color: c.text }]}
    />
  );
}

const styles = StyleSheet.create({
  caption: {
    marginTop: -18,
  },
  segmented: {
    marginHorizontal: 0,
  },
  number: {
    fontSize: type.body.fontSize,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    minWidth: 80,
    paddingVertical: 4,
  },
  bottom: {
    marginTop: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
});
