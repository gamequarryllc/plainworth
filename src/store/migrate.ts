import type { Account, Data, NWCategory, SpendCategory } from '@/lib/types';

import { DATA_VERSION, defaultOutlook, defaultReminder, defaultSettings, emptyData } from './defaults';

/** Fill in anything a stored copy from an older version might be missing. */
export function migrate(raw: unknown): Data {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<Data>;
  const version = typeof d.version === 'number' ? d.version : 1;
  // Version 4 dropped the Invested group: money put into investing just counts as saved.
  const { spendCategories, spend } = dropInvested(d.spendCategories ?? base.spendCategories, d.spend ?? {});
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
    spend,
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

/**
 * Remove the old Invested categories and their monthly amounts. Saved is income
 * minus spending, and investing was never counted as spending, so every month's
 * Saved already includes what went into investing and no total changes.
 */
export function dropInvested(
  categories: SpendCategory[],
  spend: Data['spend'],
): { spendCategories: SpendCategory[]; spend: Data['spend'] } {
  const invested = new Set(categories.filter((c) => (c.group as string) === 'invest').map((c) => c.id));
  if (!invested.size) return { spendCategories: categories, spend };
  const kept: Data['spend'] = {};
  for (const [key, entries] of Object.entries(spend)) {
    const rest = Object.fromEntries(Object.entries(entries).filter(([id]) => !invested.has(id)));
    if (Object.keys(rest).length) kept[key] = rest;
  }
  return { spendCategories: categories.filter((c) => !invested.has(c.id)), spend: kept };
}
