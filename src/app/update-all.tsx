import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { formatQuantity } from '@/components/account-row';
import { AmountInput } from '@/components/amount-input';
import { Change } from '@/components/change';
import { DateField } from '@/components/date-field';
import { KEYBOARD_BAR_ID, KeyboardBar, useFieldChain } from '@/components/keyboard-bar';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { relativeDate } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { liveCurrencySupported, metalName } from '@/lib/metals';
import { summarizeAccounts, type AccountSummary } from '@/lib/networth';
import { sortAccounts } from '@/lib/sort';
import type { ID } from '@/lib/types';
import { useStore, type NewSnapshot } from '@/store';
import { offerReminder } from '@/store/reminder-offer';

/** Update several balances at once, e.g. after payday. Only changed accounts get a new entry. */
export default function UpdateAllScreen() {
  const money = useMoney();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const sort = useStore((s) => s.settings.nwSort);
  const currency = useStore((s) => s.settings.currency);
  const addSnapshots = useStore((s) => s.addSnapshots);
  const [date, setDate] = useState(today);
  /** Typed values: the new balance, or for quantity accounts the new price per unit. */
  const [typed, setTyped] = useState<Record<ID, number | null>>({});
  const chain = useFieldChain();

  const summaries = summarizeAccounts(accounts, snapshots, categories);
  // Metals on a live price keep themselves current, so they are left out.
  const isLive = (s: AccountSummary) => !!s.account.metal && liveCurrencySupported(currency);
  // Same order as the Net Worth list, so you can work down it top to bottom.
  const all = sortAccounts(
    accounts.filter((a) => !a.closed).map((a) => summaries.get(a.id)!),
    sort,
  );
  const open = all.filter((s) => !isLive(s));
  const live = all.filter(isLive);
  const liveNote =
    live.length === 1
      ? `${live[0].account.name} follows the live ${metalName(live[0].account.metal!).toLowerCase()} price, so it isn’t listed.`
      : live.length > 1
        ? `${live.length} metal accounts follow live prices, so they aren’t listed.`
        : undefined;
  const groups = [
    { key: 'asset', title: 'Assets', items: open.filter((s) => s.kind === 'asset') },
    { key: 'liability', title: 'Liabilities', items: open.filter((s) => s.kind === 'liability') },
  ].filter((g) => g.items.length > 0);

  const newValue = (s: AccountSummary): number | null => {
    const t = typed[s.account.id];
    if (t == null) return null;
    if (s.account.unit) {
      const q = s.latest?.quantity;
      return q != null ? Math.round(q * t) : null;
    }
    return t;
  };

  const changes: { summary: AccountSummary; value: number }[] = [];
  for (const g of groups) {
    for (const s of g.items) {
      const v = newValue(s);
      if (v != null && v !== s.balance) changes.push({ summary: s, value: v });
    }
  }
  const netDelta = changes.reduce(
    (sum, ch) => sum + (ch.summary.kind === 'liability' ? -1 : 1) * (ch.value - ch.summary.balance),
    0,
  );

  const save = () => {
    const entries: NewSnapshot[] = changes.map(({ summary, value }) => ({
      accountId: summary.account.id,
      value,
      date,
      ...(summary.account.unit
        ? { quantity: summary.latest?.quantity, unitPrice: typed[summary.account.id] ?? undefined }
        : null),
    }));
    addSnapshots(entries);
    haptics.success();
    router.back();
    offerReminder();
  };

  let index = 0;

  return (
    <Screen
      form
      title="Update Balances"
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', disabled: changes.length === 0, onPress: save }]}>
      <Section
        footer={
          changes.length
            ? `${changes.length} ${changes.length === 1 ? 'account' : 'accounts'} will get a new balance.`
            : groups.length
              ? 'Type new balances below. Accounts you leave alone stay as they are.'
              : (liveNote ?? 'Add an account to update its balance here.')
        }>
        <Row title="Date" accessory={<DateField value={date} onChange={setDate} maximum={today} />} />
        <Row
          title="Net Worth Change"
          value={
            changes.length ? (
              <Change delta={netDelta} variant="body" />
            ) : (
              <Text color="secondary">{money(0, { signed: true })}</Text>
            )
          }
        />
      </Section>

      {groups.map(({ key, title, items }, g) => (
        <Section key={key} header={title} footer={g === groups.length - 1 ? liveNote : undefined}>
          {items.map((s) => {
            const i = index++;
            const v = newValue(s);
            const unit = s.account.unit;
            const subtitle =
              v != null && v !== s.balance ? (
                <Change delta={v - s.balance} invert={s.kind === 'liability'} variant="subheadline" weight="500" />
              ) : unit && s.latest?.quantity != null ? (
                `${formatQuantity(s.latest.quantity)} ${unit} · price per ${unit}`
              ) : s.latest ? (
                `${money(s.balance)} · ${relativeDate(s.latest.date)}`
              ) : (
                'No balance yet'
              );
            return (
              <Row
                key={s.account.id}
                title={s.account.name}
                subtitle={subtitle}
                accessory={
                  <AmountInput
                    ref={chain.ref(i)}
                    onFocus={chain.onFocus(i)}
                    inputAccessoryViewID={KEYBOARD_BAR_ID}
                    value={typed[s.account.id]}
                    hint={unit ? s.latest?.unitPrice : s.balance}
                    placeholder={money(unit ? (s.latest?.unitPrice ?? 0) : s.balance)}
                    onChange={(cents) => setTyped((prev) => ({ ...prev, [s.account.id]: cents }))}
                    accessibilityLabel={`New balance for ${s.account.name}`}
                    style={styles.input}
                  />
                }
              />
            );
          })}
        </Section>
      ))}
      <KeyboardBar chain={chain} count={index} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    width: 136,
  },
});
