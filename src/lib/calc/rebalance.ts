import type { PayoutRowData } from '../types';
import { parseNum } from './formatting';

export type RebalanceDirection = 'out_gt_in' | 'in_gt_out';

/** Option index 0..3. 3 = do not rebalance. */
export type RebalanceOptionIndex = 0 | 1 | 2 | 3;

export interface RebalanceContext {
  rows: PayoutRowData[];
  totalIn: number;
  totalOut: number;
  payouts: number[];
}

export function getRebalanceDirection(totalIn: number, totalOut: number): RebalanceDirection | null {
  const diff = totalOut - totalIn;
  if (Math.abs(Math.round(diff * 100)) === 0) return null;
  return diff > 0 ? 'out_gt_in' : 'in_gt_out';
}

export function getRebalanceDifference(totalIn: number, totalOut: number): number {
  return Math.abs(totalOut - totalIn);
}

/**
 * Compute new cashOut value for each row after applying the chosen rebalance option.
 * Only named rows are adjusted. No winner's payout becomes negative (cap deductions).
 * Returns array of new cashOut numbers (same length as rows).
 */
export function applyRebalance(
  ctx: RebalanceContext,
  optionIndex: RebalanceOptionIndex,
  direction: RebalanceDirection
): number[] {
  const { rows, totalIn, totalOut, payouts } = ctx;
  const diff = Math.abs(totalOut - totalIn);
  if (optionIndex === 3 || diff < 0.005) return rows.map((r) => parseNum(r.cashOut));

  const n = rows.length;
  const outVal = rows.map((r) => (r.name.trim() ? parseNum(r.cashOut) : 0));
  const namedIndexes = rows.map((_, i) => rows[i].name.trim()).map((name, i) => (name ? i : -1)).filter((i) => i >= 0);
  const numNamed = namedIndexes.length;
  if (numNamed === 0) return [...outVal];

  if (direction === 'out_gt_in') {
    // Deduct from outs; cap so no winner (payout > 0) goes below 0
    const deduct = new Array(n).fill(0);
    if (optionIndex === 0) {
      // Equal among all named; cap winners so payout stays >= 0, cap all so out stays >= 0
      const perPlayer = diff / numNamed;
      for (const i of namedIndexes) {
        const winnerCap = payouts[i] > 0 ? payouts[i] : outVal[i];
        const outCap = outVal[i];
        deduct[i] = Math.min(perPlayer, winnerCap, outCap);
      }
      redistributeRemainder(deduct, namedIndexes, diff, payouts, outVal);
    } else if (optionIndex === 1) {
      // Equal among winners only
      const winners = namedIndexes.filter((i) => payouts[i] > 0.005);
      if (winners.length === 0) return [...outVal];
      const perWinner = diff / winners.length;
      for (const i of winners) {
        deduct[i] = Math.min(perWinner, payouts[i], outVal[i]);
      }
      redistributeRemainder(deduct, winners, diff, payouts, outVal);
    } else {
      // Proportional among winners
      const winners = namedIndexes.filter((i) => payouts[i] > 0.005);
      const totalWinnerPayout = winners.reduce((s, i) => s + payouts[i], 0);
      if (totalWinnerPayout < 0.005) return [...outVal];
      for (const i of winners) {
        const share = diff * (payouts[i] / totalWinnerPayout);
        deduct[i] = Math.min(share, payouts[i], outVal[i]);
      }
      redistributeRemainder(deduct, winners, diff, payouts, outVal);
    }
    return outVal.map((out, i) => Math.max(0, out - deduct[i]));
  } else {
    // In > Out: add to outs
    const add = new Array(n).fill(0);
    if (optionIndex === 0) {
      const perPlayer = diff / numNamed;
      namedIndexes.forEach((i) => (add[i] = perPlayer));
    } else if (optionIndex === 1) {
      const losers = namedIndexes.filter((i) => payouts[i] < -0.005);
      if (losers.length === 0) {
        namedIndexes.forEach((i) => (add[i] = diff / numNamed));
      } else {
        const perLoser = diff / losers.length;
        losers.forEach((i) => (add[i] = perLoser));
      }
    } else {
      const losers = namedIndexes.filter((i) => payouts[i] < -0.005);
      const totalLoserLoss = losers.reduce((s, i) => s + Math.abs(payouts[i]), 0);
      if (losers.length === 0 || totalLoserLoss < 0.005) {
        namedIndexes.forEach((i) => (add[i] = diff / numNamed));
      } else {
        for (const i of losers) {
          add[i] = diff * (Math.abs(payouts[i]) / totalLoserLoss);
        }
      }
    }
    return outVal.map((out, i) => out + add[i]);
  }
}

function redistributeRemainder(
  deduct: number[],
  participants: number[],
  targetTotal: number,
  payouts: number[],
  outVal: number[]
): void {
  for (let round = 0; round < 100; round++) {
    const total = participants.reduce((s, i) => s + deduct[i], 0);
    let remainder = targetTotal - total;
    if (remainder <= 0.01) return;
    const withRoom = participants.filter((i) => {
      const maxDeduct = outVal[i];
      const winnerCap = payouts[i] > 0 ? payouts[i] : maxDeduct;
      return Math.min(maxDeduct, winnerCap) - deduct[i] > 0.01;
    });
    if (withRoom.length === 0) return;
    const per = remainder / withRoom.length;
    for (const i of withRoom) {
      const maxDeduct = outVal[i];
      const winnerCap = payouts[i] > 0 ? payouts[i] : maxDeduct;
      const room = Math.min(maxDeduct, winnerCap) - deduct[i];
      const extra = Math.min(per, room, remainder);
      deduct[i] += extra;
      remainder -= extra;
    }
  }
}
