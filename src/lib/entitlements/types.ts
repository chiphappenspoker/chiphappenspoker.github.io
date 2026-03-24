export type EntitlementTier = 'free' | 'pro';

export interface FeatureFlags {
  canUnlimitedSessions: boolean;
  canLifetimeStats: boolean;
  canPlayerInsights: boolean;
  canCrossSessionLeaderboard: boolean;
  canGroups: boolean;
  canProfitOverTime: boolean;
  canExport: boolean;
}

export type ProGatedFeature = keyof FeatureFlags;
