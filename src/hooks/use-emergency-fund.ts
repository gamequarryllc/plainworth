import { fundStatus, normalizeFund, type FundStatus } from '@/lib/emergency';
import type { EmergencyFund } from '@/lib/types';
import { useStore } from '@/store';

import { useToday } from './use-today';

/** The emergency fund as set up, and where it stands (null without an amount saved or a monthly cost). */
export function useEmergencyFund(): { fund: EmergencyFund | undefined; status: FundStatus | null } {
  const today = useToday();
  // A copy synced from an older version may still be in the old shape.
  const fund = normalizeFund(useStore((s) => s.settings.emergencyFund), today);
  const spend = useStore((s) => s.spend);
  const spendCategories = useStore((s) => s.spendCategories);
  const status = fund ? fundStatus(fund, { spend, spendCategories }, today) : null;
  return { fund, status };
}
