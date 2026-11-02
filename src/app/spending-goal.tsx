import { router } from 'expo-router';
import { useState } from 'react';

import { AmountInput } from '@/components/amount-input';
import { Row, Section } from '@/components/list';
import { MiniStepper } from '@/components/mini-stepper';
import { Screen } from '@/components/screen';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { parseDateKey } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import { yearGoals } from '@/lib/trends';
import { useStore } from '@/store';

/** Off, then 5% steps up to 90%. */
const KEEP = Array.from({ length: 19 }, (_, k) => (k * 5) / 100);
const percent = (r: number) => `${Math.round(r * 100)}%`;

/**
 * Goals for the year in Spending: keep a share of what you earn, and stay
 * under an average monthly spend. Both are judged over the whole year, so one
 * big month doesn't sink them.
 */
export default function SpendingGoalScreen() {
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const today = useToday();
  const year = parseDateKey(today).y;
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const saved = useStore((s) => s.settings.spendingGoal);
  const updateSettings = useStore((s) => s.updateSettings);
  const [keep, setKeep] = useState(saved ? (saved.keep ?? 0) : 0.2);
  const [limit, setLimit] = useState<number | null>(saved?.limit ?? null);
  const soFar = yearGoals({ spend, spendCategories }, {}, year, today);

  const save = () => {
    const goal = { ...(keep > 0 ? { keep } : null), ...(limit != null && limit > 0 ? { limit } : null) };
    updateSettings({ spendingGoal: Object.keys(goal).length ? goal : undefined });
    router.back();
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Remove your goals?', confirmLabel: 'Remove Goals', destructive: true });
    if (!ok) return;
    updateSettings({ spendingGoal: undefined });
    router.back();
  };

  return (
    <Screen
      form
      title="Yearly Goals"
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', onPress: save }]}>
      <Section
        header="Savings"
        footer="Of what you earn this year, saved or invested. It’s judged over the whole year, so one big month, like buying a car, can be made up later.">
        <Row
          title="Keep at Least"
          accessory={
            <MiniStepper
              value={keep}
              options={KEEP}
              onChange={setKeep}
              format={(v) => (v === 0 ? 'Off' : percent(v))}
              accessibilityLabel="savings goal"
            />
          }
        />
        {soFar.kept != null ? <Row title="So Far This Year" value={percent(soFar.kept)} /> : null}
      </Section>

      <Section header="Spending" footer="The most to spend in an average month this year. Leave it empty for no limit.">
        <Row
          title="Average Under"
          subtitle="A month"
          accessory={
            <AmountInput value={limit} onChange={setLimit} placeholder="No limit" accessibilityLabel="Monthly spending limit" />
          }
        />
        {limit != null ? <Row title="No Limit" titleColor="tint" chevron={false} onPress={() => setLimit(null)} /> : null}
        {soFar.spent != null ? <Row title="So Far This Year" value={`${whole(soFar.spent)} a month`} /> : null}
      </Section>

      {saved ? (
        <Section>
          <Row title="Remove Goals" titleColor="down" centered onPress={remove} />
        </Section>
      ) : null}
    </Screen>
  );
}
