import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { MiniStepper } from '@/components/mini-stepper';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { confirm } from '@/lib/dialogs';
import { MONTH_OPTIONS, newFund, normalizeFund, savedNow, SITUATIONS, spendingAverage, withSaved } from '@/lib/emergency';
import type { Cents, EmergencyFund } from '@/lib/types';
import { useStore } from '@/store';
import { useColors } from '@/theme';

/**
 * Set up the emergency fund, part of Spending: how much is in it, what a
 * month costs (the spending average unless typed in), and how many months
 * it should cover.
 */
export default function EmergencyFundScreen() {
  const c = useColors();
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const today = useToday();
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const stored = useStore((s) => s.settings.emergencyFund);
  const updateSettings = useStore((s) => s.updateSettings);
  const saved = normalizeFund(stored, today);

  const [fund, setFund] = useState<EmergencyFund>(() => saved ?? newFund());
  const [amount, setAmount] = useState<Cents | null>(() => (saved ? savedNow(saved) : null));

  const average = spendingAverage({ spend, spendCategories }, today);
  const monthly = fund.monthly ?? average?.amount ?? null;
  const check = <Icon name="checkmark" size={17} weight="semibold" color={c.tint} />;

  const save = () => {
    let next: EmergencyFund = { ...fund };
    if (amount != null && amount !== savedNow(fund)) next = withSaved(next, Math.max(0, amount), today);
    if (next.monthly == null || next.monthly <= 0) delete next.monthly;
    updateSettings({ emergencyFund: next });
    router.back();
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Remove your emergency fund?', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    updateSettings({ emergencyFund: undefined });
    router.back();
  };

  return (
    <Screen
      form
      title="Emergency Fund"
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', onPress: save }]}>
      <Section header="In the Fund" footer="Update it whenever it grows. Each change adds a point to the graph.">
        <Row
          title="Saved"
          accessory={<AmountInput value={amount} onChange={setAmount} accessibilityLabel="Amount saved" />}
        />
      </Section>

      {average ? (
        <Section header="A Month Costs You" footer="Your average from Spending. Type a number to use that instead.">
          <Row
            title="Spending Average"
            subtitle={`Last ${average.months === 1 ? 'month' : `${average.months} months`}`}
            value={whole(average.amount)}
            accessory={fund.monthly == null ? check : null}
            chevron={false}
            onPress={() => setFund((f) => ({ ...f, monthly: undefined }))}
          />
          <Row
            title="Type It In"
            accessory={
              <AmountInput
                value={fund.monthly ?? null}
                onChange={(v) => setFund((f) => ({ ...f, monthly: v ?? undefined }))}
                placeholder="$0"
                accessibilityLabel="Monthly costs"
              />
            }
          />
        </Section>
      ) : (
        <Section header="A Month Costs You" footer="Rent, bills, food: what you’d need if your income stopped.">
          <Row
            title="Monthly Costs"
            accessory={
              <AmountInput
                value={fund.monthly ?? null}
                onChange={(v) => setFund((f) => ({ ...f, monthly: v ?? undefined }))}
                accessibilityLabel="Monthly costs"
              />
            }
          />
        </Section>
      )}

      <Section header="Your Situation">
        {SITUATIONS.map((s) => {
          const on = fund.situation === s.key;
          return (
            <Row
              key={s.key}
              title={s.title}
              subtitle={s.detail}
              accessory={
                <View style={styles.pick}>
                  <Text color={on ? 'tint' : 'secondary'} weight={on ? '600' : undefined}>
                    {s.label}
                  </Text>
                  {on ? check : null}
                </View>
              }
              chevron={false}
              onPress={() => setFund((f) => ({ ...f, situation: s.key, months: s.months }))}
            />
          );
        })}
      </Section>

      <Section
        footer={
          monthly
            ? `${whole(fund.months * monthly)} covers ${fund.months} ${fund.months === 1 ? 'month' : 'months'}. Change it anytime.`
            : 'Change it anytime.'
        }>
        <Row
          title="Months"
          accessory={
            <MiniStepper
              value={fund.months}
              options={MONTH_OPTIONS}
              onChange={(months) => setFund((f) => ({ ...f, months }))}
              format={(v) => String(v)}
              accessibilityLabel="months to cover"
            />
          }
        />
      </Section>

      {stored ? (
        <Section>
          <Row title="Remove Emergency Fund" titleColor="down" centered onPress={remove} />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
