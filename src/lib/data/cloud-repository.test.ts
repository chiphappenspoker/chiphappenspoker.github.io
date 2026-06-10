import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbGameSession } from '../types';

const mockSingle = vi.fn();
const mockRpc = vi.fn();

vi.mock('../supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: () => ({
        select: () => ({
          single: (...args: unknown[]) => mockSingle(...args),
        }),
      }),
    })),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const session: DbGameSession = {
  id: 'session-1',
  created_by: 'user-1',
  group_id: 'group-1',
  session_date: '2026-03-26',
  currency: 'EUR',
  default_buy_in: '30',
  settlement_mode: 'greedy',
  status: 'settled',
  share_code: '',
  created_at: '2026-03-26T10:00:00.000Z',
  updated_at: '2026-03-26T10:00:00.000Z',
};

describe('cloudRepository.getSessionByShareCode', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns session and players from RPC json', async () => {
    mockRpc.mockResolvedValue({
      data: {
        session: { id: 'sess-1', share_code: 'abc12345', status: 'active' },
        players: [{ id: 'p1', session_id: 'sess-1', player_name: 'Alice' }],
      },
      error: null,
    });

    const { cloudRepository } = await import('./cloud-repository');

    const result = await cloudRepository.getSessionByShareCode('abc12345');

    expect(mockRpc).toHaveBeenCalledWith('get_session_by_share_code', { p_share_code: 'abc12345' });
    expect(result?.session.id).toBe('sess-1');
    expect(result?.players).toHaveLength(1);
  });

  it('returns null for empty code', async () => {
    const { cloudRepository } = await import('./cloud-repository');
    expect(await cloudRepository.getSessionByShareCode('')).toBeNull();
  });
});

describe('cloudRepository.saveGameSession', () => {
  beforeEach(() => {
    mockSingle.mockReset();
  });

  it('throws when Supabase upsert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    const { cloudRepository } = await import('./cloud-repository');

    await expect(cloudRepository.saveGameSession(session)).rejects.toMatchObject({
      message: 'new row violates row-level security policy',
    });
  });
});
