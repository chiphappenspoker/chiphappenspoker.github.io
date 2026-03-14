import { PayoutRowData } from '../types';
import { parseNum } from './formatting';

export interface PayoutResult {
  totalIn: number;
  totalOut: number;
  totalPayout: number;
  isBalanced: boolean;
  payouts: number[];
}

/**
 * Calculate payouts for each row and totals.
 * Negative cash-out is clamped to 0.
 */
export function calculatePayouts(rows: PayoutRowData[]): PayoutResult {
  let totalIn = 0;
  let totalOut = 0;
  const payouts: number[] = [];

  for (const row of rows) {
    const hasName = row.name.trim().length > 0;
    const inv = hasName ? parseNum(row.buyIn) : 0;
    let outv = hasName ? parseNum(row.cashOut) : 0;
    if (outv < 0) outv = 0;
    const payout = outv - inv;
    payouts.push(payout);
    totalIn += inv;
    totalOut += outv;
  }

  const totalPayout = totalOut - totalIn;
  const isBalanced = Math.abs(Math.round(totalPayout * 100)) === 0;

  return { totalIn, totalOut, totalPayout, isBalanced, payouts };
}
