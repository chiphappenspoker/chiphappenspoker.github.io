import type { EntitlementTier, FeatureFlags } from './types';

export function featureFlagsForTier(tier: EntitlementTier): FeatureFlags {
  if (tier === 'pro') {
    return {
      canUnlimitedSessions: true,
      canLifetimeStats: true,
      canPlayerInsights: true,
      canCrossSessionLeaderboard: true,
      canGroups: true,
      canProfitOverTime: true,
      canExport: true,
    };
  }
  return {
    canUnlimitedSessions: false,
    canLifetimeStats: false,
    canPlayerInsights: false,
    canCrossSessionLeaderboard: false,
    canGroups: false,
    canProfitOverTime: false,
    canExport: false,
  };
}
