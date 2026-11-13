/** Which App Store purchases unlock Pro. Pure, so it can be tested without a phone. */

/** The lifetime product in App Store Connect. */
export const LIFETIME_PRODUCT_ID = 'plainworth_pro_lifetime';

/**
 * Every product that unlocks Pro. A future monthly subscription goes here too;
 * owning the lifetime product keeps Pro forever, whatever is sold later.
 */
export const PRO_PRODUCT_IDS: readonly string[] = [LIFETIME_PRODUCT_ID];

/** One verified purchase this Apple ID owns (dates in ms since 1970). */
export type Entitlement = {
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  /** Subscriptions only. */
  expirationDate?: number;
};

/** Whether these purchases include Pro: lifetime, or a subscription that hasn't run out. */
export function hasPro(list: Entitlement[], now = Date.now()): boolean {
  return list.some(
    (e) => PRO_PRODUCT_IDS.includes(e.productId) && (e.expirationDate == null || e.expirationDate > now),
  );
}

/** Whether these purchases include lifetime Pro (early buyers keep Pro forever). */
export function ownsLifetime(list: Entitlement[]): boolean {
  return list.some((e) => e.productId === LIFETIME_PRODUCT_ID);
}

