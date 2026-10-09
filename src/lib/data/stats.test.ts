import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getGroupLeaderboard,
  getGroupSessionDates,
  getCumulativePnl,
  combinePlayerStats,
  getPlayerStats,
} from './stats';
import type { PlayerStats } from '../types';

const mockRpc = vi.fn();
vi.mock('../supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('getGroupLeaderboard', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls get_group_leaderboard with params in alphabetical order (p_from_date, p_group_id, p_to_date)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getGroupLeaderboard('group-uuid-123');
    expect(mockRpc).toHaveBeenCalledWith('get_group_leaderboard', {
      p_from_date: null,
      p_group_id: 'group-uuid-123',
      p_to_date: null,
    });
  });

  it('passes date strings when provided', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getGroupLeaderboard('g1', '2026-01-01', '2026-03-01');
    expect(mockRpc).toHaveBeenCalledWith('get_group_leaderboard', {
      p_from_date: '2026-01-01',
      p_group_id: 'g1',
      p_to_date: '2026-03-01',
    });
  });

  it('passes null for empty date strings to avoid RPC type errors', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getGroupLeaderboard('g1', '', '');
    expect(mockRpc).toHaveBeenCalledWith('get_group_leaderboard', {
      p_from_date: null,
      p_group_id: 'g1',
      p_to_date: null,
    });
  });

  it('returns mapped LeaderboardRows and throws on RPC error', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          display_name: 'Alice',
          total_profit: 150.5,
          total_sessions: 10,
          win_count: 6,
          loss_count: 4,
          avg_profit: 15.05,
          max_session_profit: 80,
        },
      ],
      error: null,
    });
    const rows = await getGroupLeaderboard('g1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      user_id: 'u1',
      display_name: 'Alice',
      total_profit: 150.5,
      total_sessions: 10,
      win_count: 6,
      loss_count: 4,
      avg_profit: 15.05,
      max_session_profit: 80,
    });
  });

  it('throws when RPC returns error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RLS violation' } });
    await expect(getGroupLeaderboard('g1')).rejects.toMatchObject({
      message: 'RLS violation',
    });
  });
});

describe('getGroupSessionDates', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls get_group_session_dates with alphabetical params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getGroupSessionDates('group-uuid-123');
    expect(mockRpc).toHaveBeenCalledWith('get_group_session_dates', {
      p_from_date: null,
      p_group_id: 'group-uuid-123',
      p_to_date: null,
    });
  });

  it('passes date strings when provided and maps session_date rows', async () => {
    mockRpc.mockResolvedValue({
      data: [{ session_date: '2026-03-01' }, { session_date: '2026-03-09' }],
      error: null,
    });
    const dates = await getGroupSessionDates('g1', '2026-01-01', '2026-03-10');
    expect(mockRpc).toHaveBeenCalledWith('get_group_session_dates', {
      p_from_date: '2026-01-01',
      p_group_id: 'g1',
      p_to_date: '2026-03-10',
    });
    expect(dates).toEqual(['2026-03-01', '2026-03-09']);
  });

  it('returns empty array on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(getGroupSessionDates('g1')).resolves.toEqual([]);
  });
});

describe('getCumulativePnl', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls get_cumulative_pnl with user, group, and date params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getCumulativePnl('user-1', 'group-1', '2026-01-01', '2026-03-01');
    expect(mockRpc).toHaveBeenCalledWith('get_cumulative_pnl', {
      p_user_id: 'user-1',
      p_group_id: 'group-1',
      p_from_date: '2026-01-01',
      p_to_date: '2026-03-01',
    });
  });

  it('passes null for missing group and dates', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getCumulativePnl('user-1');
    expect(mockRpc).toHaveBeenCalledWith('get_cumulative_pnl', {
      p_user_id: 'user-1',
      p_group_id: null,
      p_from_date: null,
      p_to_date: null,
    });
  });

  it('maps RPC rows to CumulativePnlPoint and coerces numbers', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { session_date: '2026-01-10', cumulative_profit: '10' },
        { session_date: '2026-01-20', cumulative_profit: 25.5 },
      ],
      error: null,
    });
    const points = await getCumulativePnl('user-1', null);
    expect(points).toEqual([
      { date: '2026-01-10', cumulativeProfit: 10 },
      { date: '2026-01-20', cumulativeProfit: 25.5 },
    ]);
  });

  it('returns empty array on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not pro' } });
    await expect(getCumulativePnl('user-1')).resolves.toEqual([]);
  });
});

describe('getPlayerStats', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('maps avg_win and avg_loss from get_player_stats', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          group_id: 'g1',
          total_sessions: 4,
          total_profit: 50,
          biggest_win: 30,
          biggest_loss: -20,
          win_count: 2,
          loss_count: 2,
          avg_profit: 12.5,
          avg_win: '25',
          avg_loss: -15,
          last_played: '2026-04-01',
        },
      ],
      error: null,
    });
    const rows = await getPlayerStats('u1', 'g1');
    expect(mockRpc).toHaveBeenCalledWith('get_player_stats', {
      p_user_id: 'u1',
      p_group_id: 'g1',
      p_from_date: null,
      p_to_date: null,
    });
    expect(rows[0]).toMatchObject({
      avg_win: 25,
      avg_loss: -15,
      biggest_win: 30,
      biggest_loss: -20,
    });
  });

  it('returns empty array on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const rows = await getPlayerStats('u1');
    expect(rows).toEqual([]);
  });
});

function baseRow(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    user_id: 'u1',
    group_id: 'g1',
    total_sessions: 0,
    total_profit: 0,
    biggest_win: 0,
    biggest_loss: 0,
    win_count: 0,
    loss_count: 0,
    avg_profit: 0,
    avg_win: 0,
    avg_loss: 0,
    last_played: null,
    ...overrides,
  };
}

describe('combinePlayerStats', () => {
  it('returns zeros for empty rows', () => {
    expect(combinePlayerStats([])).toEqual({
      total_sessions: 0,
      total_profit: 0,
      biggest_win: 0,
      biggest_loss: 0,
      win_count: 0,
      loss_count: 0,
      avg_profit: 0,
      avg_win: 0,
      avg_loss: 0,
      last_played: null,
    });
  });

  it('computes weighted avg_win and avg_loss across groups', () => {
    const combined = combinePlayerStats([
      baseRow({
        group_id: 'g1',
        total_sessions: 3,
        total_profit: 30,
        win_count: 2,
        loss_count: 1,
        avg_win: 20,
        avg_loss: -10,
        biggest_win: 25,
        biggest_loss: -10,
        last_played: '2026-02-01',
      }),
      baseRow({
        group_id: 'g2',
        total_sessions: 2,
        total_profit: 10,
        win_count: 1,
        loss_count: 1,
        avg_win: 40,
        avg_loss: -30,
        biggest_win: 40,
        biggest_loss: -30,
        last_played: '2026-03-01',
      }),
    ]);
    // avg_win = (20*2 + 40*1) / (2+1) = 80/3
    expect(combined.avg_win).toBeCloseTo(80 / 3);
    // avg_loss = (-10*1 + -30*1) / (1+1) = -20
    expect(combined.avg_loss).toBe(-20);
    expect(combined.win_count).toBe(3);
    expect(combined.loss_count).toBe(2);
    expect(combined.total_sessions).toBe(5);
    expect(combined.total_profit).toBe(40);
    expect(combined.biggest_win).toBe(40);
    expect(combined.biggest_loss).toBe(-30);
    expect(combined.avg_profit).toBe(8);
    expect(combined.last_played).toBe('2026-03-01');
  });

  it('returns 0 avg_win / avg_loss when counts are zero', () => {
    const combined = combinePlayerStats([
      baseRow({ total_sessions: 1, total_profit: 0, avg_win: 99, avg_loss: -99 }),
    ]);
    expect(combined.avg_win).toBe(0);
    expect(combined.avg_loss).toBe(0);
  });
});
