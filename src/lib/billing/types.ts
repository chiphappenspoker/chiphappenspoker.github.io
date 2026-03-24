export type BillingProvider = 'revenuecat' | 'stripe' | 'none';

export interface PurchaseEvent {
  provider: BillingProvider;
  productId: string;
  userId: string;
  rawPayload?: Record<string, unknown>;
}

export interface EntitlementSyncPayload {
  userId: string;
  proUnlockedAt: string;
  source: string;
}
