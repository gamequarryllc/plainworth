import type { Data, NWCategory, Outlook, Reminder, Settings, SpendCategory, SpendGroup } from '@/lib/types';

const nw = (id: string, name: string, kind: NWCategory['kind'], order: number): NWCategory => ({
  id,
  name,
  kind,
  order,
});

export const defaultNWCategories = (): NWCategory[] => [
  nw('cash', 'Cash', 'asset', 0),
  nw('investments', 'Investments', 'asset', 1),
  nw('retirement', 'Retirement', 'asset', 2),
  nw('metals', 'Precious Metals', 'asset', 3),
  nw('crypto', 'Crypto', 'asset', 4),
  nw('real-estate', 'Real Estate', 'asset', 5),
  nw('vehicles', 'Vehicles', 'asset', 6),
  nw('other-assets', 'Other Assets', 'asset', 7),
  nw('credit-cards', 'Credit Cards', 'liability', 8),
  nw('auto-loans', 'Auto Loans', 'liability', 9),
  nw('mortgages', 'Mortgages', 'liability', 10),
  nw('student-loans', 'Student Loans', 'liability', 11),
  nw('other-debt', 'Other Debt', 'liability', 12),
];

const sc = (id: string, name: string, group: SpendGroup, order: number): SpendCategory => ({
  id,
  name,
  group,
  order,
  hidden: false,
});

export const defaultSpendCategories = (): SpendCategory[] => [
  sc('rent', 'Rent', 'recurring', 0),
  sc('utilities', 'Utilities', 'recurring', 1),
  sc('gas', 'Gas', 'recurring', 2),
  sc('subscriptions', 'Subscriptions', 'recurring', 3),
  sc('misc', 'Misc.', 'recurring', 4),
  sc('eating-out', 'Eating Out', 'variable', 0),
  sc('groceries', 'Groceries', 'variable', 1),
  sc('entertainment', 'Entertainment', 'variable', 2),
  sc('exercise', 'Exercise', 'variable', 3),
  sc('general', 'General', 'variable', 4),
  sc('shopping', 'Shopping', 'variable', 5),
  sc('gifts', 'Gifts', 'variable', 6),
  sc('travel', 'Travel', 'variable', 7),
  ...defaultInvestCategories(),
  sc('paycheck-1', 'Paycheck 1', 'income', 0),
  sc('paycheck-2', 'Paycheck 2', 'income', 1),
  sc('other-income', 'Other Income', 'income', 2),
];

/** Added in data version 2, so older copies get them too. */
export const defaultInvestCategories = (): SpendCategory[] => [sc('investing', 'Investing', 'invest', 0)];

/** Bump when stored data needs migrating (see `migrate` in the store). */
export const DATA_VERSION = 2;

/** Off until turned on; when on, the 1st of each month at 9:00 AM. */
export const defaultReminder = (): Reminder => ({
  on: false,
  repeat: 'monthly',
  weekday: 0,
  monthDay: 1,
  time: 9 * 60,
});

/**
 * 3% inflation is about the long-run US average. 4% growth on top of it (about
 * 7% before inflation) is a common long-run assumption for investments.
 */
export const defaultOutlook = (): Outlook => ({
  inflation: 0.03,
  growth: 0.04,
});

export const defaultSettings = (): Settings => ({
  currency: 'USD',
  hideAmounts: false,
  requireUnlock: false,
  nwRange: '6M',
  nwView: 'accounts',
  payoffOrder: 'off',
  reminder: defaultReminder(),
  outlook: defaultOutlook(),
});

export const emptyData = (): Data => ({
  version: DATA_VERSION,
  nwCategories: defaultNWCategories(),
  accounts: [],
  snapshots: [],
  spendCategories: defaultSpendCategories(),
  spend: {},
  monthNotes: {},
  settings: defaultSettings(),
});
