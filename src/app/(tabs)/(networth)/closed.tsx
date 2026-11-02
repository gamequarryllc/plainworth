import { router } from 'expo-router';

import { AccountRow } from '@/components/account-row';
import { Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { summarizeAccounts } from '@/lib/networth';
import { useStore } from '@/store';

export default function ClosedAccountsScreen() {
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const summaries = summarizeAccounts(accounts, snapshots, categories);
  const closed = accounts.filter((a) => a.closed);

  return (
    <Screen title="Closed Accounts">
      <Section footer="Closed accounts keep their history, so past net worth stays accurate. Open one to reopen it.">
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
