/** The web build has no App Store: Pro there only comes from the Developer switch. */
export { hasPro, LIFETIME_PRODUCT_ID, ownsLifetime, PRO_PRODUCT_IDS, type Entitlement } from './entitlements';

export const purchasesAvailable = false;

export type Offer = { price: string; productId: string };
export type PurchaseResult = 'bought' | 'cancelled' | 'pending' | 'failed';

export function startPurchases(_onChange: (pro: boolean) => void) {}

export async function isTestStore(): Promise<boolean> {
  return false;
}

export async function loadOffer(): Promise<Offer | null> {
  return null;
}

export async function buy(_offer: Offer): Promise<{ result: PurchaseResult; message?: string }> {
  return { result: 'failed' };
}

export async function restore(): Promise<{ pro: boolean } | { error: string }> {
  return { error: 'Purchases aren’t available on the web.' };
}
