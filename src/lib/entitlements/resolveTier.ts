import type { EntitlementTier } from './types';

/** PRO iff `pro_unlocked_at` is set (one-time unlock). */
export function tierFromProfile(proUnlockedAt: string | null | undefined): EntitlementTier {
  if (proUnlockedAt == null || proUnlockedAt === '') return 'free';
  return 'pro';
}
