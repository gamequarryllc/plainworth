/** The web build has no App Store: Pro there only comes from the Developer switch. */
export const PRO_ENTITLEMENT = 'plainworth_pro';
export const LIFETIME_PRODUCT_ID = 'plainworth_pro_lifetime';
export const purchasesAvailable = false;

export type Offer = { price: string };
export type PurchaseResult = 'bought' | 'cancelled' | 'pending' | 'failed';

export function startPurchases(_onChange: (pro: boolean) => void) {}

export async function loadOffer(): Promise<Offer | null> {
  return null;
}

export async function buy(_offer: Offer): Promise<{ result: PurchaseResult; message?: string }> {
  return { result: 'failed' };
}

export async function restore(): Promise<{ pro: boolean } | { error: string }> {
  return { error: 'Purchases aren’t available on the web.' };
}
