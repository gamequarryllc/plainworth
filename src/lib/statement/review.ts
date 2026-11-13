import type { Cents, ID, MonthKey, SpendCategory } from '../types';

import { guessCategory, merchantKey } from './categorize';
import type { Choice, Txn } from './types';

/** One statement line in the review list. */
export interface Item extends Txn {
  id: string;
  /** Marks the line so the same one isn't added twice from another import. */
  mark: string;
  choice: Choice;
  /** The guess is worth a look. */
  sure: boolean;
  /** Already added to this month by an earlier import. */
  seen: boolean;
  /** Picked by hand in this review, so it's remembered. */
  picked: boolean;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface Review {
  items: Item[];
  /** Lines dated in other months, which were left out. */
  otherMonths: number;
}

/**
 * Turns what was read from a statement into the list to review for one month:
 * only that month's lines (lines with no date are assumed to be the month's),
 * each with a guessed category. Lines an earlier import already added are
 * marked and left out unless picked.
 */
export function buildReview(
  txns: Txn[],
  month: MonthKey,
  categories: SpendCategory[],
  remembered: Record<string, string>,
  seen: string[],
): Review {
  const inMonth = txns.filter((t) => !t.date || t.date.startsWith(month));
  const already = new Set(seen);
  const counts = new Map<string, number>();
  const items = inMonth
    .slice()
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map((t, i) => {
      // The same amount twice on one day is two purchases: number them.
      const base = `${t.date ?? month}|${t.amount}`;
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      const mark = hash(`${base}|${n}`);
      const guess = guessCategory(t, categories, remembered);
      return { ...t, id: String(i), mark, ...guess, seen: already.has(mark), picked: false };
    });
  return { items, otherMonths: txns.length - inMonth.length };
}

/** A line counts when it has a category and wasn't already added (unless picked by hand). */
export function counts(item: Item): boolean {
  return !!item.choice && item.choice !== 'skip' && (!item.seen || item.picked);
}

/** Set one line's category, and the same for the other lines from that merchant that weren't picked by hand. */
export function choose(items: Item[], id: string, choice: Choice): Item[] {
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  const key = merchantKey(target.description);
  return items.map((i) => {
    if (i.id === id) return { ...i, choice, sure: true, picked: true };
    if (key && !i.picked && !i.seen && merchantKey(i.description) === key) return { ...i, choice, sure: true };
    return i;
  });
}

export interface Totals {
  /** What each category goes up (or, with refunds, down) by. */
  byCategory: Record<ID, Cents>;
  spending: Cents;
  income: Cents;
  count: number;
}

/** What adding the review would change. Income categories count money in; the others count money out. */
export function totalsOf(items: Item[], categories: SpendCategory[]): Totals {
  const groups = new Map(categories.map((c) => [c.id, c.group]));
  const t: Totals = { byCategory: {}, spending: 0, income: 0, count: 0 };
  for (const item of items) {
    if (!counts(item)) continue;
    const group = groups.get(item.choice as ID);
    if (!group) continue;
    const amount = group === 'income' ? -item.amount : item.amount;
    t.byCategory[item.choice as ID] = (t.byCategory[item.choice as ID] ?? 0) + amount;
    if (group === 'income') t.income += amount;
    else t.spending += amount;
    t.count++;
  }
  return t;
}

/** The choices made by hand, by merchant, to remember for next time. */
export function pickedRules(items: Item[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of items) {
    const key = merchantKey(i.description);
    if (i.picked && key && i.choice) out[key] = i.choice;
  }
  return out;
}
