import { describe, it, expect } from 'vitest';
import { normalizeRevtag, revtagToSlug, buildRevolutLink } from './revolut';

describe('revolut', () => {
  describe('normalizeRevtag', () => {
    it('trims and stringifies', () => {
      expect(normalizeRevtag('  alice  ')).toBe('alice');
      expect(normalizeRevtag(null)).toBe('');
      expect(normalizeRevtag(undefined)).toBe('');
    });
  });

  describe('revtagToSlug', () => {
    it('strips leading @', () => {
      expect(revtagToSlug('@alice')).toBe('alice');
      expect(revtagToSlug('alice')).toBe('alice');
    });
  });

  describe('buildRevolutLink', () => {
    it('builds URL with amount in cents and currency', () => {
      const link = buildRevolutLink('alice', 25.5, 'EUR');
      expect(link).toContain('https://revolut.me/');
      expect(link).toContain('alice');
      expect(link).toContain('currency=EUR');
      expect(link).toContain('amount=2550'); // 25.5 * 100
    });
    it('returns empty string when revtag is empty', () => {
      expect(buildRevolutLink('', 10, 'EUR')).toBe('');
      expect(buildRevolutLink('  ', 10, 'EUR')).toBe('');
    });
    it('encodes slug in URL', () => {
      const link = buildRevolutLink('@user-name', 0, 'USD');
      expect(link).toContain('user-name');
    });
  });
});
