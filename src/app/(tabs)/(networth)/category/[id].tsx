import { router, useLocalSearchParams } from 'expo-router';

import { AccountRow, TREND_ROW_INSET } from '@/components/account-row';
import { EmptyState } from '@/components/empty-state';
import { Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { StatTiles } from '@/components/stat-tiles';
import { TrendHeader } from '@/components/trend-header';
import { useMoney } from '@/hooks/use-money';
import { formatPercent } from '@/lib/money';
import { buildSeries, updatesByAccount, summarizeAccounts, totalsOf } from '@/lib/networth';
import { useStore } from '@/store';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMoney();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const category = categories.find((c) => c.id === id);

  if (!category) {
    return (
      <Screen title="Category">
        <EmptyState icon="list.bullet" title="Category not found" message="It may have been deleted." />
      </Screen>
    );
  }

  const summaries = summarizeAccounts(accounts, snapshots, categories);
  const inCategory = accounts.filter((a) => a.categoryId === category.id);
  const open = inCategory.filter((a) => !a.closed).map((a) => summaries.get(a.id)!);
  const closed = inCategory.filter((a) => a.closed).map((a) => summaries.get(a.id)!);
  const total = open.reduce((sum, s) => sum + s.balance, 0);
  const series = buildSeries(snapshots, accounts, categories, { include: (a) => a.categoryId === category.id });
  const perAccount = updatesByAccount(snapshots);
  const totals = totalsOf(summaries.values());
  const isDebt = category.kind === 'liability';
  const share = isDebt ? (totals.liabilities ? total / totals.liabilities : 0) : totals.assets ? total / totals.assets : 0;

  const open$ = (accountId: string) => router.push({ pathname: '/account/[id]', params: { id: accountId } });

  return (
    <Screen
      title={category.name}
      right={[
        {
          label: 'Options',
          icon: 'ellipsis',
          menu: [
            {
              label: 'Add Account',
              icon: 'plus',
              onPress: () => router.push({ pathname: '/account-form', params: { categoryId: category.id } }),
            },
            {
              label: 'Edit Category',
              icon: 'pencil',
              onPress: () => router.push({ pathname: '/category-form', params: { id: category.id } }),
            },
          ],
        },
      ]}>
      <TrendHeader current={total} series={series} invert={isDebt} />
      <StatTiles
        tiles={[
          { label: 'Accounts', value: String(open.length) },
          { label: isDebt ? 'Share of Debt' : 'Share of Assets', value: formatPercent(share) },
        ]}
      />
      {open.length > 0 ? (
        <Section header="Accounts" inset={TREND_ROW_INSET}>
          {open
            .sort((a, b) => b.balance - a.balance)
            .map((s) => (
              <AccountRow
                key={s.account.id}
                summary={s}
                series={perAccount.get(s.account.id)}
                onPress={() => open$(s.account.id)}
              />
            ))}
        </Section>
      ) : null}
      {closed.length > 0 ? (
        <Section header="Closed">
          {closed.map((s) => (
            <AccountRow key={s.account.id} summary={s} onPress={() => open$(s.account.id)} />
          ))}
        </Section>
      ) : null}
      {inCategory.length === 0 ? (
        <Section footer={`Nothing in ${category.name} yet. ${money(0)} so far.`} />
      ) : null}
    </Screen>
  );
}
