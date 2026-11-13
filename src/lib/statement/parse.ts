import type { Cents, DateKey } from '../types';

import type { Target } from './types';

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A money amount as written, e.g. "1,234.56", "-12.00", "(12.00)", "12.00-", "12.00 CR", "1.234,56". */
export const MONEY = String.raw`(?<![\d.,])[-+−–]?\s?\(?[-+−–]?[$€£]?\s?(?:\d{1,3}(?:[,.]\d{3})+|\d+)[.,]\d{2}(?!\d)\)?(?:\s?-(?![\w$])|\s?CR\b|\s?DR\b)?`;

export interface Money {
  cents: Cents;
  /** Written with a minus sign or in parentheses. */
  negative: boolean;
  /** Marked "CR". */
  credit: boolean;
  /** Written with a plus sign. */
  plus: boolean;
}

/** Reads one amount. Whole numbers count only when `loose` (spreadsheet cells). Null when it isn't an amount. */
export function parseMoney(raw: string | number | null | undefined, loose = false): Money | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return { cents: Math.round(Math.abs(raw) * 100), negative: raw < 0, credit: false, plus: false };
  }
  let s = raw.trim();
  if (!s) return null;
  const credit = /CR\s*$/i.test(s);
  s = s.replace(/\s*(CR|DR)\s*$/i, '');
  const negative = /[-−–]/.test(s) || /^\(.*\)$/.test(s);
  const plus = /^\s*\+/.test(s);
  s = s.replace(/[()$€£\s+−–-]|USD|EUR|GBP|CAD|AUD/gi, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  // The last . or , followed by exactly two digits is the decimal point.
  const decimal = s.match(/[.,](\d{2})$/);
  let cents: number;
  if (decimal) {
    cents = Number(s.slice(0, -3).replace(/[.,]/g, '') || '0') * 100 + Number(decimal[1]);
  } else if (loose) {
    const one = s.match(/^(\d[\d,]*)\.(\d)$/);
    if (one) cents = Number(one[1].replace(/,/g, '')) * 100 + Number(one[2]) * 10;
    else if (/^\d[\d,]*$/.test(s)) cents = Number(s.replace(/,/g, '')) * 100;
    else {
      const n = Number(s.replace(/,/g, ''));
      if (!Number.isFinite(n)) return null;
      cents = Math.round(n * 100);
    }
  } else return null;
  if (!Number.isFinite(cents)) return null;
  return { cents, negative, credit, plus };
}

const pad = (n: number) => String(n).padStart(2, '0');

function key(year: number, month: number, day: number): DateKey | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  if (day > new Date(year, month, 0).getDate()) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The year that puts this month and day closest to the month being imported. */
function nearestYear(month: number, target: Target): number {
  const diff = month - target.month;
  if (diff > 6) return target.year - 1;
  if (diff < -6) return target.year + 1;
  return target.year;
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** A date at the start of some text, as a pattern. Used to find where a statement line begins. */
export const DATE_AT_START = new RegExp(
  String.raw`^\s*(?:` +
    String.raw`\d{4}[-/.]\d{1,2}[-/.]\d{1,2}` +
    String.raw`|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?(?![\d.,]*\d)` +
    String.raw`|(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?` +
    String.raw`|\d{1,2}(?:st|nd|rd|th)?[\s-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:[\s-,]+\d{2,4})?` +
    String.raw`)(?=$|[\s,;|·•*-])`,
  'i',
);

/**
 * Reads a date however a bank wrote it. Without a year, takes the one nearest
 * the month being imported. `dayFirst` reads 03/11 as 3 November.
 */
export function parseDay(raw: string | number | Date | null | undefined, target: Target, dayFirst = false): DateKey | null {
  if (raw == null) return null;
  if (raw instanceof Date) return key(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  if (typeof raw === 'number') return excelDay(raw);
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return key(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return key(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}|\d{2}))?(?!\d)/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    // a/b is month/day unless told otherwise or the "month" can't be one.
    if ((dayFirst && b <= 12) || a > 12) [a, b] = [b, a];
    return key(m[3] ? fullYear(Number(m[3])) : nearestYear(a, target), a, b);
  }
  const name = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  m = s.match(new RegExp(`^(?:[a-z]{3,9},?\\s+)?${name}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`));
  if (m) {
    const month = MONTH_NAMES.indexOf(m[1]) + 1;
    return key(m[3] ? Number(m[3]) : nearestYear(month, target), month, Number(m[2]));
  }
  m = s.match(new RegExp(`^(\\d{1,2})[\\s-]${name}(?:[\\s,-]+(\\d{4}|\\d{2}))?`));
  if (m) {
    const month = MONTH_NAMES.indexOf(m[2]) + 1;
    return key(m[3] ? fullYear(Number(m[3])) : nearestYear(month, target), month, Number(m[1]));
  }
  return null;
}

/** A spreadsheet's day number (days since 1900) as a date. Only plausible days count. */
export function excelDay(serial: number): DateKey | null {
  if (!Number.isFinite(serial) || serial < 32874 || serial > 73050) return null; // 1990 to 2100
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Tidies a description: one line, no runs of spaces. */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
