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
/** TestFlight only: "Test as Free" hides a test purchase so the free version can be checked. */
const TEST_FREE_KEY = 'plainworth.pro.testFree';
/** The last answer from the App Store, so Pro is there at launch and offline. */
const OWNED_KEY = 'tally.pro.owned';

interface ProState {
  /** Owned on the App Store, as StoreKit last reported. */
  owned: boolean;
  /** The Developer switch (development builds only). */
  test: boolean;
  /** True once StoreKit says this copy uses Apple's test store (TestFlight or Xcode), never on the App Store. */
  testStore: boolean;
  /** "Test as Free" in TestFlight: act as if Pro wasn't bought. Ignored outside the test store. */
  testFree: boolean;
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

function sourceOf(s: Pick<ProState, 'owned' | 'test' | 'testStore' | 'testFree'>): ProSource | null {
  if (s.testStore && s.testFree) return null;
  return s.owned ? 'lifetime' : s.test ? 'test' : null;
}

const initialOwned = purchases.purchasesAvailable && readFlag(OWNED_KEY);
const initialTest = __DEV__ && readFlag(TEST_KEY);
const initialTestFree = purchases.purchasesAvailable && readFlag(TEST_FREE_KEY);

/**
 * Kept apart from the user's data on purpose: a backup file or an export must
 * never carry Pro to someone else's phone. Real Pro comes from the App Store
 * (or Google Play) account that bought it.
 */
const initial = { owned: initialOwned, test: initialTest, testStore: false, testFree: initialTestFree };
export const useProStore = create<ProState>(() => ({
  ...initial,
  source: sourceOf(initial),
  offer: null,
}));

function update(patch: Partial<Pick<ProState, 'owned' | 'test' | 'testStore' | 'testFree'>>) {
  const next = { ...useProStore.getState(), ...patch };
  useProStore.setState({ ...patch, source: sourceOf(next) });
}

export function usePro(): boolean {
  return useProStore((s) => s.source != null);
}

function setOwned(owned: boolean) {
  const was = useProStore.getState().owned;
  update({ owned });
  if (owned !== was) storage.write(OWNED_KEY, owned ? '1' : '0').catch(() => {});
}

/** Called once at launch: connect to the App Store and keep Pro in step with it. */
export function startPro() {
  purchases.startPurchases(setOwned);
  // The "Test as Free" switch only exists in copies that use Apple's test store.
  purchases.isTestStore().then((testStore) => {
    if (testStore) update({ testStore });
  });
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
  if (res.result === 'bought') {
    setOwned(true);
    if (useProStore.getState().testFree) setTestFree(false);
  }
  return res;
}

/** Restore Purchases: true if this Apple ID owns Pro. */
export async function restorePro() {
  const res = await purchases.restore();
  if ('pro' in res) {
    setOwned(res.pro);
    if (res.pro && useProStore.getState().testFree) setTestFree(false);
  }
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
  update({ test: on });
  storage.write(TEST_KEY, on ? '1' : '0').catch(() => {});
}

/**
 * TestFlight only: act as a free user even though this Apple ID bought Pro in
 * the test store (test purchases can't be undone). Does nothing in App Store copies.
 */
export function setTestFree(on: boolean) {
  if (!useProStore.getState().testStore) return;
  update({ testFree: on });
  storage.write(TEST_FREE_KEY, on ? '1' : '0').catch(() => {});
}

/** Open the Plainworth Pro sheet, with the feature that was tapped listed first. */
export function openPaywall(feature?: ProFeature) {
  router.push(feature ? { pathname: '/pro', params: { feature } } : '/pro');
}
