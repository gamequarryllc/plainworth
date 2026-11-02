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
import { confirm } from '@/lib/dialogs';
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

  // Closing is for an account you closed or sold: it drops to $0 from today and
  // its past balances stay, so net worth history is untouched. Deleting is for
  // mistakes, and it rewrites past net worth, so it says so plainly.
  const onClose = async () => {
    const ok = await confirm({
      title: `Close ${account.name}?`,
      message:
        'Use this for an account you closed or sold. It counts as $0 from today and leaves your list, but its past balances stay, so your net worth history doesn’t change.\n\nYou can reopen it or delete it for good later from Closed Accounts, at the bottom of Net Worth.',
      confirmLabel: 'Close Account',
    });
    if (ok) {
      closeAccount(account.id, today);
      haptics.success();
      router.back();
    }
  };

  const onDelete = async () => {
    const peak = history.reduce((m, s) => Math.max(m, s.value), 0);
    const count = `${history.length} ${history.length === 1 ? 'balance' : 'balances'}`;
    const effect =
      peak > 0
        ? ` Your past net worth will go ${isDebt ? 'up' : 'down'} by what it was worth on each date (up to ${money(peak)}).`
        : '';
    const instead = account.closed ? '' : ' To keep your history as it is, close the account instead.';
    const ok = await confirm({
      title: `Delete ${account.name} for Good?`,
      message: `This erases the account and its ${count}.${effect} This can’t be undone.${instead}`,
      confirmLabel: 'Delete for Good',
      destructive: true,
    });
    if (ok) {
      router.back();
      deleteAccount(account.id);
    }
  };

  const onReopen = () => {
    reopenAccount(account.id);
    haptics.success();
  };

  const closedOn = account.closed
    ? ([...history].reverse().find((s) => s.note === 'Account closed') ?? latest)?.date
    : undefined;

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
            account.closed
              ? { label: 'Reopen Account', icon: 'arrow.uturn.backward', onPress: onReopen }
              : { label: 'Close Account', icon: 'archivebox', onPress: onClose },
            {
              label: account.closed ? 'Delete for Good' : 'Delete Account',
              icon: 'trash',
              destructive: true,
              onPress: onDelete,
            },
          ],
        },
      ]}>
      <TrendHeader label={category?.name} current={latest?.value ?? 0} series={series} invert={isDebt} />

      {account.closed ? (
        <Section
          style={styles.update}
          footer={`Closed${closedOn ? ` ${formatDate(closedOn)}` : ''}. It counts as ${money(0, { whole: true })} from then on, and its past balances still count in your net worth history. Delete it for good only if it shouldn’t be in your history at all.`}>
          <Row title="Reopen Account" titleColor="tint" onPress={onReopen} chevron={false} />
          <Row title="Delete for Good" titleColor="down" onPress={onDelete} chevron={false} />
        </Section>
      ) : (
        <View style={styles.update}>
          <Button
            title={live ? 'Update Quantity' : 'Update Balance'}
            onPress={() => router.push({ pathname: '/update', params: { id: account.id } })}
          />
        </View>
      )}

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
