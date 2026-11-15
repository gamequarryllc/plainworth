import type { Cents } from './types';

const MINUS = '−';
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);
const formatters = new Map<string, Intl.NumberFormat>();

/** Digits after the decimal point for a currency: 2, or 0 for yen and the like. */
export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

function formatter(currency: string, decimals: number): Intl.NumberFormat | null {
  const key = `${currency}:${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      return null;
    }
    formatters.set(key, f);
  }
  return f;
}

function groupDigits(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Absolute value formatted with the currency symbol, e.g. "$1,234.56". */
function formatAbs(cents: Cents, currency: string, decimals: number): string {
  const value = Math.abs(cents) / 100;
  const f = formatter(currency, decimals);
  if (f) return f.format(value);
  const [int, frac] = value.toFixed(decimals).split('.');
  return `${currencySymbol(currency)}${groupDigits(int)}${frac ? `.${frac}` : ''}`;
}

export interface MoneyOptions {
  /** Always show a leading + or − sign (for changes). */
  signed?: boolean;
  /** Drop the cents. */
  whole?: boolean;
  /** Short form for tight spaces, e.g. "$12.4K". */
  compact?: boolean;
}

export function formatMoney(cents: Cents, currency: string, opts: MoneyOptions = {}): string {
  const compact = !!opts.compact && Math.abs(cents) >= 100_000;
  const decimals = opts.whole ? 0 : currencyDecimals(currency);
  const body = compact
    ? currencySymbol(currency) + compactNumber(Math.abs(cents) / 100)
    : formatAbs(cents, currency, decimals);
  // An amount that shows as zero gets no sign: 40 cents over is "$0", not "−$0".
  if (!compact && showsAsZero(cents, decimals)) return body;
  if (opts.signed) return `${cents < 0 ? MINUS : '+'}${body}`;
  return cents < 0 ? `${MINUS}${body}` : body;
}

/** True when an amount rounds to zero at the digits it's shown with, e.g. 40 cents shown in whole dollars. */
export function showsAsZero(cents: Cents, decimals: number): boolean {
  return Math.round((Math.abs(cents) / 100) * 10 ** decimals) === 0;
}

/** Whether a whole-dollar change is worth a sign and a color: under 50 cents either way it isn't. */
export const roundsToZero = (cents: Cents) => showsAsZero(cents, 0);

/**
 * An amount for a narrow column: whole, unless that runs past `maxChars`, then
 * shortened ("$1.47M") so it's never cut off.
 */
export function fitMoney(cents: Cents, currency: string, maxChars: number, opts: { signed?: boolean } = {}): string {
  const full = formatMoney(cents, currency, { whole: true, signed: opts.signed });
  if (full.length <= maxChars || Math.abs(cents) < 100_000) return full;
  const sign = cents < 0 ? MINUS : opts.signed ? '+' : '';
  for (const digits of [2, 1, 0]) {
    const short = `${sign}${currencySymbol(currency)}${compactNumber(Math.abs(cents) / 100, digits)}`;
    if (short.length <= maxChars || digits === 0) return short;
  }
  return full;
}

/**
 * Labels for a chart's gridlines. Short ("$10K") when that tells them apart;
 * when the lines are close together ($10,000 to $10,030) it adds digits until
 * no two read the same.
 */
export function tickLabels(values: Cents[], currency: string): string[] {
  const symbol = currencySymbol(currency);
  const short = (digits: number) => (v: Cents) =>
    Math.abs(v) >= 100_000
      ? `${v < 0 ? MINUS : ''}${symbol}${compactNumber(Math.abs(v) / 100, digits)}`
      : formatMoney(v, currency, { whole: true });
  const tries: ((v: Cents) => string)[] = [
    short(1),
    short(2),
    (v) => formatMoney(v, currency, { whole: true }),
    (v) => formatMoney(v, currency),
  ];
  let labels: string[] = [];
  for (const format of tries) {
    labels = values.map(format);
    if (new Set(labels).size === labels.length) break;
  }
  return labels;
}

function compactNumber(value: number, digits = 1): string {
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const n = value / size;
      // One decimal by default, and none from 100 up ("$150K"); more only when asked for.
      const shown = digits === 1 && n >= 100 ? String(Math.round(n)) : String(parseFloat(n.toFixed(digits)));
      return `${shown}${suffix}`;
    }
  }
  return String(Math.round(value));
}

const symbolCache = new Map<string, string>();

export function currencySymbol(currency: string): string {
  const cached = symbolCache.get(currency);
  if (cached) return cached;
  let symbol = currency;
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0);
    symbol = parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    symbol = currency === 'USD' ? '$' : currency;
  }
  symbolCache.set(currency, symbol);
  return symbol;
}

export function formatPercent(ratio: number, opts: { signed?: boolean } = {}): string {
  if (!Number.isFinite(ratio)) return '—';
  const pct = Math.abs(ratio * 100);
  const digits = pct >= 100 ? 0 : pct >= 10 ? 1 : 2;
  const body = `${pct.toFixed(digits)}%`;
  if (!opts.signed) return ratio < 0 ? `${MINUS}${body}` : body;
  return `${ratio < 0 ? MINUS : '+'}${body}`;
}

/**
 * Parse what someone typed into an amount field. Accepts "1,234.56", "$45",
 * and simple sums like "120+45.50-10". Returns cents, or null when empty/invalid.
 */
export function parseAmount(text: string): Cents | null {
  const cleaned = text.replace(/[^0-9.+\-]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const terms = cleaned.match(/[+\-]?[^+\-]+/g);
  if (!terms) return null;
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const num = term.replace(/^[+\-]/, '');
    if (!/^\d*\.?\d*$/.test(num) || num === '.' || num === '') continue;
    total += sign * Math.round(parseFloat(num) * 100);
  }
  return total;
}

/** A typed amount with its sign: the number pad has no minus key, so "below zero" is a switch beside the field. */
export function signedAmount(cents: Cents | null, below: boolean): Cents | null {
  if (cents == null) return null;
  return below && cents !== 0 ? -Math.abs(cents) : cents;
}

/** The switch for a balance under zero: an overdrawn account, or a card that owes you money back. */
export const belowZeroTitle = (kind: 'asset' | 'liability' | undefined) => (kind === 'liability' ? 'Credit Balance' : 'Below Zero');
export const belowZeroNote = (kind: 'asset' | 'liability' | undefined) =>
  kind === 'liability' ? 'You overpaid, so they owe you' : 'The account is overdrawn';

/** A plain number (e.g. a quantity), or null when empty/invalid. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Cents → plain editable text, e.g. 123450 → "1234.5", 4500 → "45". */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents == null) return '';
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Keep typing tidy for a decimal amount field: digits and one dot, at most two
 * decimals, thousands separators added as you type.
 */
export function formatTyping(raw: string, maxDecimals = 2): string {
  // In much of the world the number pad's decimal key is a comma. The field
  // groups thousands with commas itself, so a comma just typed is the one at
  // the very end: that one is the decimal point.
  let typed = raw;
  if (maxDecimals > 0 && typed.endsWith(',') && !typed.includes('.')) typed = `${typed.slice(0, -1)}.`;
  let s = typed.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, maxDecimals);
  const [int, frac] = s.split('.');
  // Past 12 digits (a trillion) it's a held key, not a balance: the extra digits are dropped.
  const intClean = int.replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
  const grouped = groupDigits(intClean);
  return frac !== undefined ? `${grouped || '0'}.${frac}` : grouped;
}

/** The most digits an amount can have before the decimal point. */
export const MAX_DIGITS = 12;

export const MASK = '••••••';

export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'PLN', name: 'Polish Złoty' },
];
