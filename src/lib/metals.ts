import { compareSnapshots } from './networth';
import type { Account, Cents, DateKey, ID, Metal, Snapshot } from './types';

export const METALS: { key: Metal; name: string }[] = [
  { key: 'XAU', name: 'Gold' },
  { key: 'XAG', name: 'Silver' },
  { key: 'XPT', name: 'Platinum' },
  { key: 'XPD', name: 'Palladium' },
];

export function metalName(metal: Metal): string {
  return METALS.find((m) => m.key === metal)?.name ?? metal;
}

const NAME_HINTS: [Metal, RegExp][] = [
  ['XAU', /\b(gold|xau)\b/i],
  ['XAG', /\b(silver|xag)\b/i],
  ['XPT', /\b(platinum|xpt)\b/i],
  ['XPD', /\b(palladium|xpd)\b/i],
];

/** The metal an account's name points to, e.g. "Silver Eagles" → silver. None if it names zero or several. */
export function guessMetal(name: string): Metal | undefined {
  const hits = NAME_HINTS.filter(([, pattern]) => pattern.test(name));
  return hits.length === 1 ? hits[0][0] : undefined;
}

/** Currencies the price source quotes in. */
const LIVE_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'HKD', 'SGD',
  'SEK', 'NOK', 'DKK', 'NZD', 'MXN', 'INR', 'BRL', 'ZAR', 'KRW',
]);

export function liveCurrencySupported(currency: string): boolean {
  return LIVE_CURRENCIES.has(currency);
}

/**
 * gold-api.com: free, no key, and its terms allow use in apps. Prices are per
 * troy ounce and already converted to the requested currency. The request
 * carries only the metal and the currency.
 */
const PRICE_API = 'https://api.gold-api.com/price';

export function spotPriceUrl(metal: Metal, currency: string): string {
  return currency === 'USD' ? `${PRICE_API}/${metal}` : `${PRICE_API}/${metal}/${currency}`;
}

/** Price per troy ounce in cents from a price response, or null if it isn't the quote we asked for. */
export function parseSpotPrice(body: unknown, metal: Metal, currency: string): Cents | null {
  if (!body || typeof body !== 'object') return null;
  const { price, symbol, currency: quoted } = body as Record<string, unknown>;
  const value = typeof price === 'number' ? price : typeof price === 'string' ? Number(price) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (typeof symbol === 'string' && symbol.toUpperCase() !== metal) return null;
  if (typeof quoted === 'string' && quoted.toUpperCase() !== currency) return null;
  return Math.round(value * 100);
}

export async function fetchSpotPrice(metal: Metal, currency: string, timeoutMs = 10_000): Promise<Cents> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(spotPriceUrl(metal, currency), { signal: controller.signal });
    if (!res.ok) throw new Error(`Price request failed (${res.status})`);
    const price = parseSpotPrice(await res.json(), metal, currency);
    if (price == null) throw new Error('Unexpected price response');
    return price;
  } finally {
    clearTimeout(timer);
  }
}

export type SpotUpdate =
  | { type: 'add'; accountId: ID; date: DateKey; quantity: number; unitPrice: Cents; value: Cents }
  | { type: 'update'; snapshotId: ID; unitPrice: Cents; value: Cents };

/**
 * What to write after fetching live prices, for each open account that follows
 * a metal: today's automatic entry gets the new price, an older latest entry
 * gets a new entry for today at the same quantity, and an entry made by hand
 * today is left alone.
 */
export function spotUpdates(
  accounts: Account[],
  snapshots: Snapshot[],
  prices: Partial<Record<Metal, Cents>>,
  today: DateKey,
): SpotUpdate[] {
  const latest = new Map<ID, Snapshot>();
  for (const s of snapshots) {
    const current = latest.get(s.accountId);
    if (!current || compareSnapshots(current, s) < 0) latest.set(s.accountId, s);
  }
  const updates: SpotUpdate[] = [];
  for (const account of accounts) {
    if (account.closed || !account.metal) continue;
    const price = prices[account.metal];
    const last = latest.get(account.id);
    if (price == null || !last || last.quantity == null || last.quantity <= 0) continue;
    const value = Math.round(last.quantity * price);
    if (last.date === today) {
      if (last.source !== 'spot' || (last.unitPrice === price && last.value === value)) continue;
      updates.push({ type: 'update', snapshotId: last.id, unitPrice: price, value });
    } else if (last.date < today) {
      updates.push({ type: 'add', accountId: account.id, date: today, quantity: last.quantity, unitPrice: price, value });
    }
  }
  return updates;
}
