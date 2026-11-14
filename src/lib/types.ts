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

/** Before data version 4 there was also an 'invest' group; money put into investing now just counts as saved. */
export type SpendGroup = 'recurring' | 'variable' | 'income';

export interface SpendCategory {
  id: ID;
  name: string;
  group: SpendGroup;
  order: number;
  /** Hidden categories keep their history but are not offered for new months. */
  hidden: boolean;
}

export type RangeKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '4Y' | '8Y' | 'ALL';
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
  /** Keep at least this share of what you earn (income minus spending), e.g. 0.2. */
  keep?: number;
  /** Spend no more than this in an average month. */
  limit?: Cents;
}

/** Who you are, for how many months an emergency fund should cover. */
export type EmergencySituation = 'steady' | 'stake' | 'self';

/**
 * Money set aside for emergencies, and how many months of costs it should
 * cover. It belongs to Spending: what's in it is typed in (kept with the date
 * of each change, for the graph), and a month's cost is the spending average
 * unless one is typed in.
 */
export interface EmergencyFund {
  /** What's in the fund, each time it was changed, oldest first. The last one is what's there now. */
  saved: { date: DateKey; amount: Cents }[];
  /** What a month costs, typed in. Left out, it's the spending average. */
  monthly?: Cents;
  situation?: EmergencySituation;
  /** The goal, in months of costs. */
  months: number;
}

export interface Settings {
  currency: string;
  /** Optional, for "Alex’s Net Worth" and shared images. Empty means none was given or it was cleared. */
  name?: string;
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
  emergencyFund?: EmergencyFund;
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
