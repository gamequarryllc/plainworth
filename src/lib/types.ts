/** Money is stored as integer cents to avoid floating point drift. */
export type Cents = number;
/** Local calendar date, `YYYY-MM-DD`. */
export type DateKey = string;
/** Calendar month, `YYYY-MM`. */
export type MonthKey = string;
export type ID = string;

export type CategoryKind = 'asset' | 'liability';

/** Precious metals with a live market price: gold, silver, platinum, palladium. */
export type Metal = 'XAU' | 'XAG' | 'XPT' | 'XPD';

export interface NWCategory {
  id: ID;
  name: string;
  kind: CategoryKind;
  order: number;
}

export interface Account {
  id: ID;
  name: string;
  categoryId: ID;
  createdAt: number;
  /** Closed accounts keep their history but are hidden from the main list. */
  closed: boolean;
  /**
   * When set (for example "oz"), balances are entered as quantity × price per unit.
   * Useful for metals, shares or crypto.
   */
  unit?: string;
  /** Follows this metal's live price per troy ounce; the unit is then "oz". */
  metal?: Metal;
  /** Debts only: yearly interest rate in percent, e.g. 22.9. */
  apr?: number;
}

/** A balance entry: what an account was worth on a given day. */
export interface Snapshot {
  id: ID;
  accountId: ID;
  date: DateKey;
  value: Cents;
  createdAt: number;
  quantity?: number;
  unitPrice?: Cents;
  note?: string;
  /** "spot" when the price came from the live feed, so a newer price can replace it the same day. */
  source?: 'spot';
}

/** Invested money isn't spending: it's part of what you kept, tracked apart from plain savings. */
export type SpendGroup = 'recurring' | 'variable' | 'invest' | 'income';

export interface SpendCategory {
  id: ID;
  name: string;
  group: SpendGroup;
  order: number;
  /** Hidden categories keep their history but are not offered for new months. */
  hidden: boolean;
}

export type RangeKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
/** How the net worth list is grouped. */
export type NWView = 'accounts' | 'categories';
/** How accounts are ordered within Assets and Liabilities. */
export type NWSort = 'value' | 'valueAsc' | 'updated' | 'stale' | 'change' | 'name';
/** The order debts are listed in: highest rate first, smallest balance first, or by balance. */
export type PayoffOrder = 'off' | 'avalanche' | 'snowball';

/** How often the update reminder comes. */
export type ReminderRepeat = 'weekly' | 'biweekly' | 'monthly';

/** A notification set on this phone that nudges you to update your balances. */
export interface Reminder {
  on: boolean;
  repeat: ReminderRepeat;
  /** Weekly and every 2 weeks: 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Monthly: the 1st or the 15th, or 0 for the last day of the month. */
  monthDay: number;
  /** Minutes after midnight, e.g. 540 for 9:00 AM. */
  time: number;
  /** Every 2 weeks: the day of the first one, so it keeps to the same weeks. */
  start?: DateKey;
}

/** A net worth to reach, in today's money. */
export interface NetWorthGoal {
  amount: Cents;
  /** Reach it by the end of this year. Neither this nor `age` means no date. */
  year?: number;
  /** Reach it by the end of the year you turn this age (needs `birthYear`). */
  age?: number;
}

/** What looking ahead assumes. Everything ahead is in today's money. */
export interface Outlook {
  /** Prices rise this much a year, e.g. 0.03. */
  inflation: number;
  /** What you have grows this much a year on top of inflation, e.g. 0.04. */
  growth: number;
  /** What you add each month, in today's money. Left out, it's worked out from your pace. */
  monthly?: Cents;
}

/** Spending goals, judged over the whole year so one big month doesn't sink them. */
export interface SpendingGoal {
  /** Keep at least this share of what you earn (saved plus invested), e.g. 0.2. */
  keep?: number;
  /** Spend no more than this in an average month. */
  limit?: Cents;
}

export interface Settings {
  currency: string;
  hideAmounts: boolean;
  requireUnlock: boolean;
  nwRange: RangeKey;
  nwView: NWView;
  payoffOrder: PayoffOrder;
  /** Sort By on the Net Worth list. Missing in older data, which means highest value first. */
  nwSort?: NWSort;
  /** The day of the last backup, shown in Settings. */
  lastBackup?: DateKey;
  reminder: Reminder;
  goal?: NetWorthGoal;
  /** For goals set by age. */
  birthYear?: number;
  outlook: Outlook;
  spendingGoal?: SpendingGoal;
}

export interface Data {
  /** Format version of the stored copy, for migrating older ones. */
  version: number;
  nwCategories: NWCategory[];
  accounts: Account[];
  snapshots: Snapshot[];
  spendCategories: SpendCategory[];
  /** month → category → amount */
  spend: Record<MonthKey, Record<ID, Cents>>;
  monthNotes: Record<MonthKey, string>;
  settings: Settings;
}
