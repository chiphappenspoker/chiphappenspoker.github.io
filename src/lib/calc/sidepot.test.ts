import { describe, it, expect } from 'vitest';
import { calculateSidePots, calculateWinnings } from './sidepot';

describe('calculateSidePots', () => {
  it('builds main pot and side pots by bet level', () => {
    const players = [
      { name: 'A', bet: 10 },
      { name: 'B', bet: 30 },
      { name: 'C', bet: 50 },
    ];
    const pots = calculateSidePots(players, 0);
    expect(pots).toHaveLength(3);
    expect(pots[0].name).toBe('Main Pot');
    expect(pots[0].size).toBe(30); // 10*3
    expect(pots[0].players).toEqual(['A', 'B', 'C']);
    expect(pots[1].name).toBe('Side Pot 1');
    expect(pots[1].size).toBe(40); // (30-10)*2
    expect(pots[1].players).toEqual(['B', 'C']);
    expect(pots[2].name).toBe('Side Pot 2');
    expect(pots[2].size).toBe(20); // (50-30)*1
    expect(pots[2].players).toEqual(['C']);
  });

  it('adds initialPot to main pot only', () => {
    const players = [{ name: 'A', bet: 20 }];
    const pots = calculateSidePots(players, 100);
    expect(pots[0].size).toBe(120); // 20 + 100
  });

  it('filters out zero-bet players', () => {
    const players = [
      { name: 'A', bet: 0 },
      { name: 'B', bet: 20 },
    ];
    const pots = calculateSidePots(players, 0);
    expect(pots).toHaveLength(1);
    expect(pots[0].players).toEqual(['B']);
  });

  it('returns empty for no valid players', () => {
    expect(calculateSidePots([], 0)).toEqual([]);
    expect(calculateSidePots([{ name: 'A', bet: 0 }], 0)).toEqual([]);
  });
});

describe('calculateWinnings', () => {
  it('splits pot per board among winners', () => {
    const pots = [
      { name: 'Main Pot', size: 60, players: ['A', 'B', 'C'] },
    ];
    const boards = 2;
    const winnerSelections = {
      '0-0-A': true,
      '0-0-B': true,
      '0-1-A': true,
      '0-1-B': true,
    };
    const { playerWinnings, totalWon } = calculateWinnings(pots, boards, winnerSelections);
    expect(playerWinnings['A']).toBe(30); // 30 per board, 2 boards
    expect(playerWinnings['B']).toBe(30);
    expect(totalWon).toBe(60);
  });

  it('single winner takes full pot per board', () => {
    const pots = [
      { name: 'Main Pot', size: 40, players: ['A', 'B'] },
    ];
    const winnerSelections = { '0-0-A': true, '0-1-A': true };
    const { playerWinnings, totalWon } = calculateWinnings(pots, 2, winnerSelections);
    expect(playerWinnings['A']).toBe(40);
    expect(totalWon).toBe(40);
  });
});
