export type { EntitlementTier, FeatureFlags, ProGatedFeature } from './types';
export { FREE_TIER_HISTORY_DISPLAY_CAP, FREE_TIER_OWNED_SESSION_CAP } from './constants';
export { tierFromProfile } from './resolveTier';
export { featureFlagsForTier } from './featureFlags';
export {
  EntitlementsProvider,
  useEntitlements,
  type NotificationPrefs,
} from './EntitlementsProvider';
