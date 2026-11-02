import type { AccountSummary } from './networth';
import type { Cents, PayoffOrder } from './types';

export const PAYOFF_ORDERS: { key: PayoffOrder; title: string; detail: string }[] = [
  { key: 'avalanche', title: 'Avalanche', detail: 'Highest interest rate first. Saves the most.' },
  { key: 'snowball', title: 'Snowball', detail: 'Smallest balance first. Quicker wins.' },
  { key: 'off', title: 'Off', detail: 'Largest balance first.' },
];

/** "22.9%": up to two decimals, no trailing zeros. */
export function formatRate(apr: number): string {
  return `${Number(apr.toFixed(2))}%`;
}

/** Roughly what a balance costs in interest each month at a yearly rate. */
export function monthlyInterest(balance: Cents, apr: number | undefined): Cents {
  if (!apr || balance <= 0) return 0;
  return Math.round((balance * apr) / 100 / 12);
}

/**
 * Debts in the order to pay them down. Avalanche puts the highest rate first
 * (debts with no rate entered go after the rest), Snowball the smallest
 * balance. Paid-off debts always go last. "Off" keeps largest balance first.
 */
export function sortDebts(debts: AccountSummary[], order: PayoffOrder): AccountSummary[] {
  const byBalanceDesc = (a: AccountSummary, b: AccountSummary) => b.balance - a.balance;
  if (order === 'off') return [...debts].sort(byBalanceDesc);
  const owed = debts.filter((d) => d.balance > 0);
  const paid = debts.filter((d) => d.balance <= 0).sort(byBalanceDesc);
  const rate = (d: AccountSummary) => d.account.apr ?? -1;
  owed.sort((a, b) =>
    order === 'avalanche' ? rate(b) - rate(a) || a.balance - b.balance : a.balance - b.balance || rate(b) - rate(a),
  );
  return [...owed, ...paid];
}

/** The debt to put extra money toward, if the order can tell (Avalanche needs a rate). */
export function payFirst(sorted: AccountSummary[], order: PayoffOrder): AccountSummary | undefined {
  const first = sorted[0];
  if (order === 'off' || !first || first.balance <= 0) return undefined;
  if (order === 'avalanche' && first.account.apr == null) return undefined;
  return first;
}
