import { router } from 'expo-router';

import { AccountRow } from '@/components/account-row';
import { Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { useMoney } from '@/hooks/use-money';
import { summarizeAccounts } from '@/lib/networth';
import { useStore } from '@/store';

export default function ClosedAccountsScreen() {
  const money = useMoney();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const summaries = summarizeAccounts(accounts, snapshots, categories);
  const closed = accounts.filter((a) => a.closed);

  return (
    <Screen title="Closed Accounts">
      <Section footer={`These count as ${money(0, { whole: true })} now, and their past balances stay in your net worth history. Tap one to reopen it or delete it for good.`}>
        {closed.map((a) => (
          <AccountRow
            key={a.id}
            summary={summaries.get(a.id)!}
            onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}
          />
        ))}
      </Section>
    </Screen>
  );
}
