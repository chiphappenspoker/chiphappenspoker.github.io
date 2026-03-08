import { describe, it, expect } from 'vitest';
import { computeGreedyTransactions } from './settlement';

describe('computeGreedyTransactions', () => {
  it('minimises transactions between debtors and creditors', () => {
    const balances = [
      { name: 'Alice', amount: 20 },
      { name: 'Bob', amount: -10 },
      { name: 'Carol', amount: -10 },
    ];
    const tx = computeGreedyTransactions(balances);
    expect(tx).toHaveLength(2);
    expect(tx).toEqual(
      expect.arrayContaining([
        { from: 'Bob', to: 'Alice', amount: 10 },
        { from: 'Carol', to: 'Alice', amount: 10 },
      ])
    );
  });

  it('ignores near-zero balances (threshold 0.005)', () => {
    const balances = [
      { name: 'Alice', amount: 0.002 },
      { name: 'Bob', amount: -0.002 },
    ];
    const tx = computeGreedyTransactions(balances);
    expect(tx).toHaveLength(0);
  });

  it('sorts transactions by from name', () => {
    const balances = [
      { name: 'Zara', amount: 30 },
      { name: 'Alice', amount: -20 },
      { name: 'Bob', amount: -10 },
    ];
    const tx = computeGreedyTransactions(balances);
    expect(tx[0].from).toBe('Alice');
    expect(tx[1].from).toBe('Bob');
  });

  it('returns empty when no creditors or debtors', () => {
    expect(computeGreedyTransactions([])).toEqual([]);
    expect(computeGreedyTransactions([{ name: 'A', amount: 0 }])).toEqual([]);
  });

  it('rounds transfer amount to 2 decimals', () => {
    const balances = [
      { name: 'A', amount: 10.333 },
      { name: 'B', amount: -10.333 },
    ];
    const tx = computeGreedyTransactions(balances);
    expect(tx).toHaveLength(1);
    expect(tx[0].amount).toBe(10.33);
  });
});
