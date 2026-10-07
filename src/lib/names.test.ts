import { describe, expect, it } from 'vitest';
import { compareByFirstName, firstNameOf } from './names';

describe('firstNameOf', () => {
  it('returns the first token', () => {
    expect(firstNameOf('Cahit Ugur')).toBe('Cahit');
    expect(firstNameOf('Brian')).toBe('Brian');
    expect(firstNameOf('  Lauren  Smith  ')).toBe('Lauren');
  });
});

describe('compareByFirstName', () => {
  it('sorts by first name when surnames exist', () => {
    const names = ['Zara Adams', 'Bob Smith', 'Anna Lee'];
    expect([...names].sort(compareByFirstName)).toEqual([
      'Anna Lee',
      'Bob Smith',
      'Zara Adams',
    ]);
  });

  it('uses full name when first names match', () => {
    const names = ['Chris Z', 'Chris A', 'Chris'];
    expect([...names].sort(compareByFirstName)).toEqual([
      'Chris',
      'Chris A',
      'Chris Z',
    ]);
  });
});
