import { useEffect } from 'react';
import { create } from 'zustand';

import { todayKey } from '@/lib/dates';
import { fetchSpotPrice, liveCurrencySupported } from '@/lib/metals';
import type { Account, Cents, Metal } from '@/lib/types';

import { useStore } from './index';

/** Reuse a price looked up this recently. */
const FRESH_MS = 15 * 60_000;
/** Pull to refresh: the source itself only changes every 30 seconds. */
const FORCED_MS = 30_000;
/** After a failed lookup (offline, say), wait this long before trying again unless asked. */
const RETRY_MS = 60_000;

interface Quote {
  price: Cents;
  at: number;
}

interface SpotState {
  /** Latest price per troy ounce, by `${metal}:${currency}`. Kept in memory only. */
  quotes: Record<string, Quote>;
  loading: Record<string, boolean>;
  failedAt: Record<string, number>;
}

const useSpot = create<SpotState>(() => ({ quotes: {}, loading: {}, failedAt: {} }));

const keyOf = (metal: Metal, currency: string) => `${metal}:${currency}`;
const pending = new Map<string, Promise<Cents | null>>();

/** Today's price per troy ounce: from memory when recent, otherwise looked up. Null if it can't be had. */
export function loadSpotPrice(metal: Metal, currency: string, opts: { force?: boolean } = {}): Promise<Cents | null> {
  if (!liveCurrencySupported(currency)) return Promise.resolve(null);
  const key = keyOf(metal, currency);
  const { quotes, failedAt } = useSpot.getState();
  const quote = quotes[key];
  if (quote && Date.now() - quote.at < (opts.force ? FORCED_MS : FRESH_MS)) return Promise.resolve(quote.price);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  if (!opts.force && Date.now() - (failedAt[key] ?? 0) < RETRY_MS) return Promise.resolve(null);

  useSpot.setState((s) => ({ loading: { ...s.loading, [key]: true } }));
  const request = fetchSpotPrice(metal, currency)
    .then((price) => {
      useSpot.setState((s) => ({
        quotes: { ...s.quotes, [key]: { price, at: Date.now() } },
        loading: { ...s.loading, [key]: false },
      }));
      return price;
    })
    .catch(() => {
      useSpot.setState((s) => ({
        failedAt: { ...s.failedAt, [key]: Date.now() },
        loading: { ...s.loading, [key]: false },
      }));
      return null;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

const followsMetal = (a: Account) => !a.closed && !!a.metal;

/**
 * Look up prices for every metal that open accounts follow and write them in.
 * Only runs when asked (pull to refresh on Net Worth): metal accounts no longer
 * add an entry by themselves each day, so the chart only moves when you update.
 */
export async function refreshSpotPrices(opts: { force?: boolean } = {}): Promise<void> {
  const { accounts, settings } = useStore.getState();
  const currency = settings.currency;
  const metals = [...new Set(accounts.filter(followsMetal).map((a) => a.metal!))];
  if (metals.length === 0 || !liveCurrencySupported(currency)) return;
  const found = await Promise.all(metals.map((m) => loadSpotPrice(m, currency, opts)));
  // The currency may have changed while the lookups were out.
  if (useStore.getState().settings.currency !== currency) return;
  const prices: Partial<Record<Metal, Cents>> = {};
  metals.forEach((m, i) => {
    const price = found[i];
    if (price != null) prices[m] = price;
  });
  useStore.getState().applySpotPrices(prices, todayKey());
}

export type SpotStatus = 'off' | 'unsupported' | 'loading' | 'ready' | 'failed';

/** A metal's current price for showing in a form, looked up if needed (force: fresher than 30 seconds). */
export function useSpotPrice(
  metal: Metal | undefined,
  opts: { force?: boolean } = {},
): { price: Cents | null; status: SpotStatus } {
  const currency = useStore((s) => s.settings.currency);
  const supported = liveCurrencySupported(currency);
  const key = metal ? keyOf(metal, currency) : '';
  const quote = useSpot((s) => (key ? s.quotes[key] : undefined));
  const loading = useSpot((s) => (key ? !!s.loading[key] : false));
  const failed = useSpot((s) => (key ? !!s.failedAt[key] : false));

  useEffect(() => {
    if (metal && supported) loadSpotPrice(metal, currency, { force: opts.force });
  }, [metal, currency, supported, opts.force]);

  if (!metal) return { price: null, status: 'off' };
  if (!supported) return { price: null, status: 'unsupported' };
  if (quote) return { price: quote.price, status: 'ready' };
  return { price: null, status: failed && !loading ? 'failed' : 'loading' };
}

/** Current prices for several metals at once, freshly looked up when the screen opens. Missing while loading or offline. */
export function useSpotPrices(metals: Metal[]): Partial<Record<Metal, Cents>> {
  const currency = useStore((s) => s.settings.currency);
  const supported = liveCurrencySupported(currency);
  const wanted = [...new Set(metals)].sort().join(',');
  const quotes = useSpot((s) => s.quotes);

  useEffect(() => {
    if (!wanted || !supported) return;
    for (const m of wanted.split(',') as Metal[]) loadSpotPrice(m, currency, { force: true });
  }, [wanted, currency, supported]);

  const prices: Partial<Record<Metal, Cents>> = {};
  if (!supported) return prices;
  for (const m of metals) {
    const quote = quotes[keyOf(m, currency)];
    if (quote) prices[m] = quote.price;
  }
  return prices;
}
