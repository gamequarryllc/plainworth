import { router } from 'expo-router';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { notify } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';

import type { ProFeature } from '@/lib/pro';
import * as purchases from '@/lib/purchases';
import { storage } from '@/lib/storage';

/**
 * Where Pro came from: bought on the App Store ("lifetime"), or the Developer
 * switch in development builds ("test").
 */
export type ProSource = 'lifetime' | 'test';

const TEST_KEY = 'tally.pro.test';
/** The last answer from the App Store, so Pro is there at launch and offline. */
const OWNED_KEY = 'tally.pro.owned';

interface ProState {
  /** Owned on the App Store, as RevenueCat last reported. */
  owned: boolean;
  /** The Developer switch (development builds only). */
  test: boolean;
  source: ProSource | null;
  /** The lifetime offer with the store's price, once loaded. */
  offer: purchases.Offer | null;
}

function readFlag(key: string): boolean {
  try {
    return storage.read(key) === '1';
  } catch {
    return false;
  }
}

function sourceOf(owned: boolean, test: boolean): ProSource | null {
  return owned ? 'lifetime' : test ? 'test' : null;
}

const initialOwned = purchases.purchasesAvailable && readFlag(OWNED_KEY);
const initialTest = __DEV__ && readFlag(TEST_KEY);

/**
 * Kept apart from the user's data on purpose: a backup file or an export must
 * never carry Pro to someone else's phone. Real Pro comes from the App Store
 * (or Google Play) account that bought it.
 */
export const useProStore = create<ProState>(() => ({
  owned: initialOwned,
  test: initialTest,
  source: sourceOf(initialOwned, initialTest),
  offer: null,
}));

export function usePro(): boolean {
  return useProStore((s) => s.source != null);
}

function setOwned(owned: boolean) {
  const { test, owned: was } = useProStore.getState();
  useProStore.setState({ owned, source: sourceOf(owned, test) });
  if (owned !== was) storage.write(OWNED_KEY, owned ? '1' : '0').catch(() => {});
}

/** Called once at launch: connect to the App Store and keep Pro in step with it. */
export function startPro() {
  purchases.startPurchases(setOwned);
  // So "Unlock Pro" cards can show the price in the buyer's currency.
  if (purchases.purchasesAvailable && !useProStore.getState().owned) loadOffer();
}

/** Load the lifetime price from the store (for the Pro sheet). */
export async function loadOffer(): Promise<purchases.Offer | null> {
  const offer = await purchases.loadOffer();
  if (offer) useProStore.setState({ offer });
  return offer;
}

/** Buy lifetime Pro with Apple's purchase sheet. */
export async function buyPro(offer: purchases.Offer) {
  const res = await purchases.buy(offer);
  if (res.result === 'bought') setOwned(true);
  return res;
}

/** Restore Purchases: true if this Apple ID owns Pro. */
export async function restorePro() {
  const res = await purchases.restore();
  if ('pro' in res) setOwned(res.pro);
  return res;
}

const ACCOUNT = Platform.OS === 'android' ? 'Google account' : 'Apple ID';

/** The Restore Purchases button (Pro sheet and Settings), with its alerts. */
export async function restorePurchases() {
  if (!purchases.purchasesAvailable) {
    notify(
      'Nothing to restore',
      __DEV__
        ? 'This test build can’t make real purchases. To turn Pro off again, use the Pro switch in Settings › Developer.'
        : 'This copy of Plainworth can’t reach the App Store.',
    );
    return;
  }
  const res = await restorePro();
  if ('error' in res) notify('Couldn’t restore', res.error);
  else if (res.pro) {
    haptics.success();
    notify('Plainworth Pro is back', 'Thank you for supporting Plainworth.');
  } else notify('No purchases found', `Plainworth Pro wasn’t bought with this ${ACCOUNT}.`);
}

/** Development builds only: turn Pro on or off without buying it. Remembered between launches. */
export function setTestPro(on: boolean) {
  if (!__DEV__) return;
  useProStore.setState((s) => ({ test: on, source: sourceOf(s.owned, on) }));
  storage.write(TEST_KEY, on ? '1' : '0').catch(() => {});
}

/** Open the Plainworth Pro sheet, with the feature that was tapped listed first. */
export function openPaywall(feature?: ProFeature) {
  router.push(feature ? { pathname: '/pro', params: { feature } } : '/pro');
}
