import { describe, it, expect } from 'vitest';
import { fmt, fmtInt, parseNum } from './formatting';

describe('formatting', () => {
  describe('fmt', () => {
    it('formats to 2 decimal places', () => {
      expect(fmt(1)).toBe('1.00');
      expect(fmt(1.5)).toBe('1.50');
      expect(fmt(1.234)).toBe('1.23');
      expect(fmt(1.236)).toBe('1.24');
    });
    it('converts -0.00 to 0.00', () => {
      expect(fmt(-0)).toBe('0.00');
      expect(fmt(-0.004)).toBe('0.00');
    });
  });

  describe('fmtInt', () => {
    it('formats to integer string', () => {
      expect(fmtInt(1)).toBe('1');
      expect(fmtInt(1.7)).toBe('2');
      expect(fmtInt(-1)).toBe('-1');
    });
    it('converts -0 to 0', () => {
      expect(fmtInt(-0)).toBe('0');
    });
  });

  describe('parseNum', () => {
    it('returns 0 for null, undefined, empty string', () => {
      expect(parseNum(null)).toBe(0);
      expect(parseNum(undefined)).toBe(0);
      expect(parseNum('')).toBe(0);
      expect(parseNum('   ')).toBe(0);
    });
    it('parses numeric string', () => {
      expect(parseNum('100')).toBe(100);
      expect(parseNum('30.5')).toBe(30.5);
      expect(parseNum(42)).toBe(42);
    });
    it('handles European format (comma as decimal)', () => {
      expect(parseNum('1.000,50')).toBe(1000.5);
      expect(parseNum('30,25')).toBe(30.25);
    });
    it('handles US format (comma as thousands)', () => {
      expect(parseNum('1,000.50')).toBe(1000.5);
    });
    it('handles mixed separators (last wins for decimal)', () => {
      expect(parseNum('1,000.50')).toBe(1000.5);
    });
    it('returns 0 for non-numeric', () => {
      expect(parseNum('abc')).toBe(0);
    });
  });
});
