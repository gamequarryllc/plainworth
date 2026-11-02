import type { Data } from '@/lib/types';

import { DATA_VERSION, defaultInvestCategories, defaultSettings, emptyData } from './defaults';

/** Fill in anything a stored copy from an older version might be missing. */
export function migrate(raw: unknown): Data {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<Data>;
  const version = typeof d.version === 'number' ? d.version : 1;
  let spendCategories = d.spendCategories ?? base.spendCategories;
  // Version 2 added the Invested group to each month.
  if (version < 2 && !spendCategories.some((c) => c.group === 'invest')) {
    spendCategories = [...spendCategories, ...defaultInvestCategories()];
  }
  return {
    version: DATA_VERSION,
    nwCategories: d.nwCategories ?? base.nwCategories,
    accounts: d.accounts ?? [],
    snapshots: d.snapshots ?? [],
    spendCategories,
    spend: d.spend ?? {},
    monthNotes: d.monthNotes ?? {},
    settings: { ...defaultSettings(), ...d.settings },
  };
}
