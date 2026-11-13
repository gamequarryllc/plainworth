import { fundAccounts, fundStatus, formatMonths, type FundStatus } from '@/lib/emergency';
import type { EmergencyFund, ID } from '@/lib/types';
import { useStore } from '@/store';

import { useToday } from './use-today';

/** The emergency fund as set up, and where it stands (null without a balance or a monthly cost). */
export function useEmergencyFund(): { fund: EmergencyFund | undefined; status: FundStatus | null } {
  const today = useToday();
  const fund = useStore((s) => s.settings.emergencyFund);
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const status = fund ? fundStatus(fund, { accounts, snapshots, spend, spendCategories }, today) : null;
  return { fund, status };
}

/** The line an emergency fund account shows in place of its subtitle, e.g. "Emergency Fund · 5.1 of 6 mo". */
export function useFundBadge(): (id: ID) => string | undefined {
  const { fund, status } = useEmergencyFund();
  const accounts = useStore((s) => s.accounts);
  const marked = new Set(fund ? fundAccounts(fund, accounts).map((a) => a.id) : []);
  return (id) => {
    if (!marked.has(id)) return undefined;
    return status ? `Emergency · ${formatMonths(status.covered)} of ${status.goal} mo` : 'Emergency Fund';
  };
}
