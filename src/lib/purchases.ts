import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import { Platform } from 'react-native';

import { hasPro, LIFETIME_PRODUCT_ID, type Entitlement } from './entitlements';

/**
 * App Store purchases, straight through Apple's StoreKit 2 (our own small
 * native module in `modules/plainworth-store`). No outside service and no
 * server: Apple signs every purchase and StoreKit checks the signature on the
 * phone, so only verified purchases count. Nothing about the user's balances
 * or spending is involved.
 *
 * Purchases only work in a real build (a development build, TestFlight or the
 * App Store). Expo Go and the web have no StoreKit module, so there
 * `purchasesAvailable` is false and the Developer switch in Settings stands in.
 */

export { hasPro, LIFETIME_PRODUCT_ID, ownsLifetime, PRO_PRODUCT_IDS, type Entitlement } from './entitlements';

type StoreModule = {
  getProducts(ids: string[]): Promise<{ id: string; displayPrice: string; displayName: string }[]>;
  currentEntitlements(): Promise<Entitlement[]>;
  sync(): Promise<Entitlement[]>;
  environment(): Promise<string>;
  purchase(id: string): Promise<{ result: PurchaseResult; message?: string; entitlements?: Entitlement[] }>;
  addListener(event: 'onPurchasesChanged', listener: (e: { entitlements: Entitlement[] }) => void): EventSubscription;
};

const store = Platform.OS === 'ios' ? requireOptionalNativeModule<StoreModule>('PlainworthStore') : null;

/** True when this build can talk to the App Store. */
export const purchasesAvailable = store != null;

/** Something the user can buy, with its price in the buyer's own currency. */
export type Offer = { price: string; productId: string };

export type PurchaseResult = 'bought' | 'cancelled' | 'pending' | 'failed';

let started = false;

function message(e: unknown): string {
  return (e as { message?: string })?.message ?? 'The App Store couldn’t be reached.';
}

/** Start once at launch and get told whenever the user's purchases change (a buy, Ask to Buy, a refund). */
export function startPurchases(onChange: (pro: boolean) => void) {
  if (!store || started) return;
  started = true;
  // Subscribing also starts StoreKit's transaction listener, which Apple asks apps to run from launch.
  store.addListener('onPurchasesChanged', (e) => onChange(hasPro(e.entitlements)));
  store
    .currentEntitlements()
    .then((list) => onChange(hasPro(list)))
    .catch(() => {}); // Keep what we knew last time.
}

/**
 * True when this copy buys from Apple's test store: TestFlight or a build run
 * from Xcode. Always false for a copy from the App Store.
 */
export async function isTestStore(): Promise<boolean> {
  if (!store) return false;
  try {
    const env = await store.environment();
    return env === 'Sandbox' || env === 'Xcode';
  } catch {
    return false;
  }
}

/** The lifetime offer with its price, or null if the store can't be reached. */
export async function loadOffer(): Promise<Offer | null> {
  if (!store) return null;
  try {
    const [product] = await store.getProducts([LIFETIME_PRODUCT_ID]);
    return product ? { price: product.displayPrice, productId: product.id } : null;
  } catch {
    return null;
  }
}

/** Show Apple's purchase sheet. */
export async function buy(offer: Offer): Promise<{ result: PurchaseResult; message?: string }> {
  if (!store) return { result: 'failed' };
  try {
    const res = await store.purchase(offer.productId);
    // 'pending' is Ask to Buy, or a payment that needs approving: Pro arrives through the listener later.
    if (res.result === 'bought' && res.entitlements && !hasPro(res.entitlements)) return { result: 'failed' };
    return { result: res.result, message: res.message };
  } catch (e) {
    return { result: 'failed', message: message(e) };
  }
}

/** Ask the App Store for anything this Apple ID already bought. */
export async function restore(): Promise<{ pro: boolean } | { error: string }> {
  if (!store) return { error: 'This copy of Plainworth can’t reach the App Store.' };
  try {
    return { pro: hasPro(await store.sync()) };
  } catch (e) {
    // Sync fails if the user closes the sign-in prompt; what's on the phone may still have Pro.
    try {
      if (hasPro(await store.currentEntitlements())) return { pro: true };
    } catch {}
    return { error: message(e) };
  }
}
