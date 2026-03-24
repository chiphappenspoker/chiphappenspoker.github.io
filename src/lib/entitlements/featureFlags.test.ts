import { describe, it, expect } from 'vitest';
import { featureFlagsForTier } from './featureFlags';

describe('featureFlagsForTier', () => {
  it('enables all flags for pro', () => {
    const f = featureFlagsForTier('pro');
    expect(f.canGroups).toBe(true);
    expect(f.canExport).toBe(true);
    expect(f.canLifetimeStats).toBe(true);
  });

  it('disables all gated flags for free', () => {
    const f = featureFlagsForTier('free');
    expect(Object.values(f).every((v) => v === false)).toBe(true);
  });
});
