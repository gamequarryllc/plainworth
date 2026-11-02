import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

/**
 * App Store (and later Google Play) purchases, through RevenueCat.
 *
 * Plainworth has no accounts and no server: RevenueCat checks the receipt with
 * Apple and says whether this Apple ID owns the `plainworth_pro` entitlement. RevenueCat
 * only sees the purchase and a random ID it makes up; none of the user's
 * balances or spending ever leave the phone.
 *
 * Purchases only work in a real build (EAS development build, TestFlight or the
 * App Store). Expo Go and the web have no native purchases module, so there
 * `purchasesAvailable` is false and the Developer switch in Settings stands in.
 */

/** The RevenueCat entitlement every Pro product unlocks. */
export const PRO_ENTITLEMENT = 'plainworth_pro';
/** The lifetime product in App Store Connect, used if no RevenueCat offering is set up. */
export const LIFETIME_PRODUCT_ID = 'plainworth_pro_lifetime';

const extra = Constants.expoConfig?.extra as { revenueCatAppleKey?: string; revenueCatGoogleKey?: string } | undefined;
const API_KEY = Platform.select({ ios: extra?.revenueCatAppleKey, android: extra?.revenueCatGoogleKey }) || '';

/** True when this build can talk to the App Store. */
export const purchasesAvailable = Platform.OS !== 'web' && !!NativeModules.RNPurchases && API_KEY.length > 0;

/** Something the user can buy: a RevenueCat package when an offering exists, or the bare product. */
export type Offer = { price: string; pkg?: PurchasesPackage; product?: PurchasesStoreProduct };

let configured = false;

function sdk() {
  // Required lazily so Expo Go and the web never load the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('react-native-purchases') as typeof import('react-native-purchases')).default;
}

export function hasPro(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] != null;
}

/** Start RevenueCat once and get told whenever the user's purchases change (a buy, a restore, a refund). */
export function startPurchases(onChange: (pro: boolean) => void) {
  if (!purchasesAvailable || configured) return;
  const Purchases = sdk();
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
  Purchases.addCustomerInfoUpdateListener((info) => onChange(hasPro(info)));
  Purchases.getCustomerInfo()
    .then((info) => onChange(hasPro(info)))
    .catch(() => {}); // Offline: keep what we knew last time.
}

/** The lifetime offer with its price in the buyer's own currency, or null if the store can't be reached. */
export async function loadOffer(): Promise<Offer | null> {
  if (!configured) return null;
  const Purchases = sdk();
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    const pkg = current?.lifetime ?? current?.availablePackages[0];
    if (pkg) return { price: pkg.product.priceString, pkg };
    const [product] = await Purchases.getProducts([LIFETIME_PRODUCT_ID], Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
    return product ? { price: product.priceString, product } : null;
  } catch {
    return null;
  }
}

export type PurchaseResult = 'bought' | 'cancelled' | 'pending' | 'failed';

/** Show Apple's purchase sheet. */
export async function buy(offer: Offer): Promise<{ result: PurchaseResult; message?: string }> {
  const Purchases = sdk();
  try {
    const { customerInfo } = offer.pkg
      ? await Purchases.purchasePackage(offer.pkg)
      : await Purchases.purchaseStoreProduct(offer.product!);
    return { result: hasPro(customerInfo) ? 'bought' : 'failed' };
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean | null; message?: string };
    const codes = Purchases.PURCHASES_ERROR_CODE;
    if (err.userCancelled || err.code === codes.PURCHASE_CANCELLED_ERROR) return { result: 'cancelled' };
    // Ask to Buy, or a payment that needs approving: Pro arrives through the listener later.
    if (err.code === codes.PAYMENT_PENDING_ERROR) return { result: 'pending' };
    return { result: 'failed', message: err.message };
  }
}

/** Ask the App Store for anything this Apple ID already bought. */
export async function restore(): Promise<{ pro: boolean } | { error: string }> {
  try {
    return { pro: hasPro(await sdk().restorePurchases()) };
  } catch (e) {
    return { error: (e as { message?: string }).message ?? 'The App Store couldn’t be reached.' };
  }
}
