import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGroupLeaderboard, getCumulativePnl } from './stats';

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
