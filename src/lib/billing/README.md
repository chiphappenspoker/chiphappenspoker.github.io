# Billing (deferred)

PRO is a **one-time unlock**. This folder holds types and a no-op adapter until RevenueCat and/or Stripe are wired up.

## Planned flow

1. **Web (PWA):** Stripe Checkout or RevenueCat Web Billing → webhook hits Supabase Edge Function `billing-webhook` → sets `profiles.pro_unlocked_at` and `pro_unlock_source`.
2. **Android (Capacitor):** RevenueCat + Play Billing → same webhook or client refresh after purchase.
3. Client calls `syncEntitlementsFromBilling()` (real adapter) after purchase, then `EntitlementsProvider.refresh()`.

## Environment (future)

- `STRIPE_WEBHOOK_SECRET` or RevenueCat webhook authorization header
- `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function (already standard)

## Database

- `profiles.pro_unlocked_at` — set when PRO is granted
- `profiles.pro_unlock_source` — e.g. `stripe`, `revenuecat`, `manual`

Edge stub: `supabase/functions/billing-webhook`.
