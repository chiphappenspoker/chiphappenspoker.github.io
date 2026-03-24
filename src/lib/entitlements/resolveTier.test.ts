import { describe, it, expect } from 'vitest';
import { tierFromProfile } from './resolveTier';

describe('tierFromProfile', () => {
  it('returns free when unset', () => {
    expect(tierFromProfile(null)).toBe('free');
    expect(tierFromProfile(undefined)).toBe('free');
    expect(tierFromProfile('')).toBe('free');
  });

  it('returns pro when timestamp present', () => {
    expect(tierFromProfile('2026-01-01T00:00:00Z')).toBe('pro');
  });
});
