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
  const negative = cents < 0;
  let body: string;
  if (opts.compact && Math.abs(cents) >= 100_000) {
    body = currencySymbol(currency) + compactNumber(Math.abs(cents) / 100);
  } else {
    body = formatAbs(cents, currency, opts.whole ? 0 : currencyDecimals(currency));
  }
  if (opts.signed) return `${negative ? MINUS : '+'}${body}`;
  return negative ? `${MINUS}${body}` : body;
}

function compactNumber(value: number): string {
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const n = value / size;
      return `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}${suffix}`;
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
  let s = raw.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, maxDecimals);
  const [int, frac] = s.split('.');
  const intClean = int.replace(/^0+(?=\d)/, '');
  const grouped = groupDigits(intClean);
  return frac !== undefined ? `${grouped || '0'}.${frac}` : grouped;
}

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
