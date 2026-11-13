import type { Cents, DateKey, ID } from '../types';

/** One line of a statement. `amount` is positive for money going out and negative for money coming in. */
export interface Txn {
  date: DateKey | null;
  description: string;
  amount: Cents;
}

/** A piece of text and where it sits on a page (0 to 1, from the top left), from a PDF or a photo. */
export interface Fragment {
  page: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The month being imported into, used to fill in a missing year and to pick day/month order. */
export interface Target {
  year: number;
  month: number;
}

/** What a category choice can be: one of the person's categories, or left out. */
export type Choice = ID | 'skip' | null;
