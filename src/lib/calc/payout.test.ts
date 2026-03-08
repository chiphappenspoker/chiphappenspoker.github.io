import { describe, it, expect } from 'vitest';
import { calculatePayouts } from './payout';
import type { PayoutRowData } from '../types';

function row(id: string, name: string, buyIn: string, cashOut: string, settled = false): PayoutRowData {
  return { id, name, buyIn, cashOut, settled };
}

describe('calculatePayouts', () => {
  it('computes totals and per-row payouts', () => {
    const rows = [
      row('1', 'Alice', '30', '50', true),
      row('2', 'Bob', '30', '10', true),
    ];
    const result = calculatePayouts(rows);
    expect(result.totalIn).toBe(60);
    expect(result.totalOut).toBe(60);
    expect(result.payouts).toEqual([20, -20]);
    expect(result.isBalanced).toBe(true);
    expect(result.totalPayout).toBe(0);
  });

  it('clamps negative cash-out to 0', () => {
    const rows = [
      row('1', 'Alice', '30', '-5', true),
    ];
    const result = calculatePayouts(rows);
    expect(result.payouts[0]).toBe(-30); // 0 - 30
    expect(result.totalOut).toBe(0);
  });

  it('reports unbalanced when total payout is not zero', () => {
    const rows = [
      row('1', 'Alice', '30', '50', true),
      row('2', 'Bob', '30', '20', true),
    ];
    const result = calculatePayouts(rows);
    expect(result.totalIn).toBe(60);
    expect(result.totalOut).toBe(70);
    expect(result.isBalanced).toBe(false);
    expect(result.totalPayout).toBe(10);
  });

  it('handles empty rows', () => {
    const result = calculatePayouts([]);
    expect(result.totalIn).toBe(0);
    expect(result.totalOut).toBe(0);
    expect(result.payouts).toEqual([]);
    expect(result.isBalanced).toBe(true);
  });

  it('handles locale-aware buy-in/cash-out (comma decimal)', () => {
    const rows = [
      row('1', 'Alice', '30,50', '45,25', true),
    ];
    const result = calculatePayouts(rows);
    expect(result.totalIn).toBe(30.5);
    expect(result.totalOut).toBe(45.25);
    expect(result.payouts[0]).toBeCloseTo(14.75);
  });
});
