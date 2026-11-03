import type { Account, Data, NWCategory } from '@/lib/types';

import { DATA_VERSION, defaultInvestCategories, defaultOutlook, defaultReminder, defaultSettings, emptyData } from './defaults';

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
  let nwCategories = d.nwCategories ?? base.nwCategories;
  let accounts = d.accounts ?? [];
  // Version 3 folded the Retirement category into Investments.
  if (version < 3) ({ nwCategories, accounts } = foldRetirement(nwCategories, accounts));
  return {
    version: DATA_VERSION,
    nwCategories,
    accounts,
    snapshots: d.snapshots ?? [],
    spendCategories,
    spend: d.spend ?? {},
    monthNotes: d.monthNotes ?? {},
    settings: {
      ...defaultSettings(),
      ...d.settings,
      reminder: { ...defaultReminder(), ...d.settings?.reminder },
      outlook: { ...defaultOutlook(), ...d.settings?.outlook },
    },
  };
}

/**
 * Move every Retirement account into Investments and drop the Retirement
 * category. If Investments was removed, Retirement becomes Investments instead.
 */
function foldRetirement(categories: NWCategory[], accounts: Account[]): { nwCategories: NWCategory[]; accounts: Account[] } {
  if (!categories.some((c) => c.id === 'retirement')) return { nwCategories: categories, accounts };
  if (!categories.some((c) => c.id === 'investments')) {
    return {
      nwCategories: categories.map((c) => (c.id === 'retirement' ? { ...c, id: 'investments', name: 'Investments' } : c)),
      accounts: accounts.map((a) => (a.categoryId === 'retirement' ? { ...a, categoryId: 'investments' } : a)),
    };
  }
  return {
    nwCategories: categories.filter((c) => c.id !== 'retirement'),
    accounts: accounts.map((a) => (a.categoryId === 'retirement' ? { ...a, categoryId: 'investments' } : a)),
  };
}
