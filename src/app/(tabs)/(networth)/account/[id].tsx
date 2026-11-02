import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { formatQuantity } from '@/components/account-row';
import { Button } from '@/components/button';
import { Change } from '@/components/change';
import { EmptyState } from '@/components/empty-state';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { TrendHeader } from '@/components/trend-header';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { formatDate } from '@/lib/dates';
import { formatRate, monthlyInterest } from '@/lib/debts';
import { choose, confirm } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';
import { liveCurrencySupported, metalName } from '@/lib/metals';
import { buildSeries, compareSnapshots } from '@/lib/networth';
import { useStore } from '@/store';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMoney();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const currency = useStore((s) => s.settings.currency);
  const closeAccount = useStore((s) => s.closeAccount);
  const reopenAccount = useStore((s) => s.reopenAccount);
  const deleteAccount = useStore((s) => s.deleteAccount);

  const account = accounts.find((a) => a.id === id);
  if (!account) {
    return (
      <Screen title="Account">
        <EmptyState icon="list.bullet" title="Account not found" message="It may have been deleted." />
      </Screen>
    );
  }

  const category = categories.find((c) => c.id === account.categoryId);
  const isDebt = category?.kind === 'liability';
  const history = snapshots.filter((s) => s.accountId === account.id).sort(compareSnapshots);
  const latest = history[history.length - 1];
  const series = buildSeries(snapshots, accounts, categories, { include: (a) => a.id === account.id });
  const live = account.metal && liveCurrencySupported(currency) ? account.metal : undefined;

  // One way to remove an account. Keeping history (closing it) is the default
  // because deleting rewrites past net worth; deleting is for mistakes.
  const onRemove = async () => {
    const choice = await choose({
      title: `Remove ${account.name}?`,
      message:
        'Keep History zeroes it as of today and moves it to Closed Accounts, so your past net worth stays the same. Delete Everything erases it and all its balances, which changes your past net worth.',
      options: [{ label: 'Keep History' }, { label: 'Delete Everything', destructive: true }],
    });
    if (choice === 0) {
      closeAccount(account.id, today);
      haptics.success();
      router.back();
    } else if (choice === 1) {
      router.back();
      deleteAccount(account.id);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${account.name}?`,
      message: 'This erases the account and all its balances, which changes your past net worth.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) {
      router.back();
      deleteAccount(account.id);
    }
  };

  const newestFirst = [...history].reverse();

  return (
    <Screen
      title={account.name}
      right={[
        {
          label: 'Options',
          icon: 'ellipsis',
          menu: [
            {
              label: 'Edit Account',
              icon: 'pencil',
              onPress: () => router.push({ pathname: '/account-form', params: { id: account.id } }),
            },
            ...(account.closed
              ? [
                  { label: 'Reopen Account', icon: 'arrow.uturn.backward' as const, onPress: () => reopenAccount(account.id) },
                  { label: 'Delete Account', icon: 'trash' as const, destructive: true, onPress: onDelete },
                ]
              : [{ label: 'Remove Account', icon: 'trash' as const, destructive: true, onPress: onRemove }]),
          ],
        },
      ]}>
      <TrendHeader label={category?.name} current={latest?.value ?? 0} series={series} invert={isDebt} />

      <View style={styles.update}>
        <Button
          title={account.closed ? 'Add a Balance' : live ? 'Update Quantity' : 'Update Balance'}
          onPress={() => router.push({ pathname: '/update', params: { id: account.id } })}
        />
      </View>

      {isDebt && !account.closed ? (
        <Section
          footer={
            account.apr != null
              ? 'The monthly interest is an estimate from the balance and rate. Your statement has the exact amount.'
              : 'Set the interest rate to see what this debt costs each month and where it falls in your payoff order.'
          }>
          <Row
            title="Interest Rate"
            value={`${formatRate(account.apr ?? 0)} APR`}
            onPress={() => router.push({ pathname: '/account-form', params: { id: account.id } })}
          />
          {account.apr != null && (latest?.value ?? 0) > 0 ? (
            <Row title="Interest a Month" value={`About ${money(monthlyInterest(latest!.value, account.apr))}`} />
          ) : null}
        </Section>
      ) : null}

      {account.unit && latest?.quantity != null ? (
        <Section footer={live ? `Follows the live ${metalName(live).toLowerCase()} price per troy ounce.` : undefined}>
          <Row title="Quantity" value={`${formatQuantity(latest.quantity)} ${account.unit}`} />
          <Row title={`Price per ${account.unit}`} value={money(latest.unitPrice ?? 0)} />
        </Section>
      ) : null}

      <Section header={`History · ${history.length} ${history.length === 1 ? 'entry' : 'entries'}`}>
        {newestFirst.map((snap, i) => {
          const prev = newestFirst[i + 1];
          const delta = prev ? snap.value - prev.value : null;
          const sub =
            snap.note ||
            (account.unit && snap.quantity != null
              ? `${formatQuantity(snap.quantity)} ${account.unit} × ${money(snap.unitPrice ?? 0)}`
              : undefined);
          return (
            <Row
              key={snap.id}
              title={formatDate(snap.date)}
              subtitle={sub}
              value={money(snap.value)}
              detail={delta ? <Change delta={delta} invert={isDebt} variant="footnote" weight="500" /> : undefined}
              onPress={() => router.push({ pathname: '/entry', params: { id: snap.id } })}
            />
          );
        })}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  update: {
    marginTop: 18,
  },
});
