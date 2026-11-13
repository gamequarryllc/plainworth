import { router, useLocalSearchParams } from 'expo-router';
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
import { MONTH_OPTIONS, newFund, SITUATIONS, spendingAverage } from '@/lib/emergency';
import { kindOf, seriesByAccount } from '@/lib/networth';
import type { Cents, EmergencyFund, ID } from '@/lib/types';
import { useStore } from '@/store';
import { useColors } from '@/theme';

/**
 * Set up the emergency fund: which accounts hold it (or, without accounts,
 * how much is saved), what a month costs, and how many months it should
 * cover. Works with only Net Worth, only Spending, or both.
 */
export default function EmergencyFundScreen() {
  const c = useColors();
  const money = useMoney();
  const whole = (cents: number) => money(cents, { whole: true });
  const today = useToday();
  const { account: preset } = useLocalSearchParams<{ account?: string }>();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const nwCategories = useStore((s) => s.nwCategories);
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const saved = useStore((s) => s.settings.emergencyFund);
  const updateSettings = useStore((s) => s.updateSettings);

  const [fund, setFund] = useState<EmergencyFund>(() => {
    const start = saved ?? newFund();
    if (preset && !start.accounts.some((a) => a.id === preset)) {
      return { ...start, accounts: [...start.accounts, { id: preset }], saved: undefined };
    }
    return start;
  });

  const categories = new Map(nwCategories.map((x) => [x.id, x]));
  const assets = accounts.filter((a) => !a.closed && kindOf(a, categories) === 'asset');
  const series = seriesByAccount(snapshots);
  const balanceOf = (id: ID) => series.get(id)?.at(-1)?.value ?? null;
  const picked = fund.accounts.filter((a) => assets.some((x) => x.id === a.id));
  const average = spendingAverage({ spend, spendCategories }, today);
  const monthly = fund.monthly ?? average?.amount ?? null;
  const check = <Icon name="checkmark" size={17} weight="semibold" color={c.tint} />;

  const toggle = (id: ID) =>
    setFund((f) => {
      const on = f.accounts.some((a) => a.id === id);
      return { ...f, accounts: on ? f.accounts.filter((a) => a.id !== id) : [...f.accounts, { id }] };
    });
  const setCap = (id: ID, cap: Cents | null) =>
    setFund((f) => ({
      ...f,
      accounts: f.accounts.map((a) => (a.id === id ? (cap != null && cap > 0 ? { id, cap } : { id }) : a)),
    }));

  const save = () => {
    const next: EmergencyFund = { ...fund, accounts: picked };
    if (picked.length) delete next.saved;
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
      {assets.length ? (
        <Section header="Held In" footer="Pick the accounts your emergency fund is in.">
          {assets.map((a) => {
            const b = balanceOf(a.id);
            return (
              <Row
                key={a.id}
                title={a.name}
                subtitle={b != null ? money(b) : 'No balance yet'}
                accessory={picked.some((p) => p.id === a.id) ? check : null}
                chevron={false}
                onPress={() => toggle(a.id)}
              />
            );
          })}
        </Section>
      ) : null}

      {picked.length ? (
        <Section header="Only Part of It?" footer="Leave it empty to count the whole account.">
          {picked.map((p) => (
            <Row
              key={p.id}
              title={assets.find((a) => a.id === p.id)?.name ?? ''}
              subtitle="Count up to"
              accessory={
                <AmountInput
                  value={p.cap ?? null}
                  onChange={(v) => setCap(p.id, v)}
                  placeholder="All of it"
                  accessibilityLabel="Amount that counts"
                />
              }
            />
          ))}
        </Section>
      ) : (
        <Section
          header="Saved So Far"
          footer={assets.length ? 'Or pick an account above.' : 'Change it whenever it grows.'}>
          <Row
            title="Saved"
            accessory={
              <AmountInput
                value={fund.saved ?? null}
                onChange={(v) => setFund((f) => ({ ...f, saved: v ?? undefined }))}
                accessibilityLabel="Amount saved"
              />
            }
          />
        </Section>
      )}

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

      {saved ? (
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
