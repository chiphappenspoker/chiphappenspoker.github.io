import { describe, it, expect, vi } from 'vitest';
import { savePayoutSession } from './save-payout-session';
import type { PayoutRowData } from '@/lib/types';

const baseRow: PayoutRowData = {
  id: 'r1',
  name: 'Alice',
  buyIn: '30',
  cashOut: '40',
  settled: false,
  paid: false,
};

describe('savePayoutSession', () => {
  it('saves via atomic saveOwnSession and does not call per-row session/player writes', async () => {
    const saveOwnSession = vi.fn().mockResolvedValue({
      session_id: 'sess-1',
      share_code: 'abc12345',
    });
    const saveGameSession = vi.fn();
    const saveGamePlayer = vi.fn();
    const getGameSession = vi.fn();
    const getGroupMembersWithIds = vi.fn().mockResolvedValue([]);
    const getGamePlayers = vi.fn();
    const deleteGamePlayer = vi.fn();

    const result = await savePayoutSession({
      repo: {
        saveOwnSession,
        saveGameSession,
        saveGamePlayer,
        getGameSession,
        getGroupMembersWithIds,
        getGamePlayers,
        deleteGamePlayer,
      },
      userId: 'user-1',
      rows: [baseRow],
      buyIn: '30',
      currency: 'EUR',
      settlementMode: 'greedy',
      selectedGroupId: null,
      currentSessionId: null,
      status: 'active',
      shareCode: null,
      useSharedRpc: false,
      upsertSharedSession: vi.fn(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(saveOwnSession).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        currency: 'EUR',
        default_buy_in: '30',
        players: expect.arrayContaining([
          expect.objectContaining({ player_name: 'Alice', buy_in: 30, cash_out: 40 }),
        ]),
      })
    );
    expect(saveGameSession).not.toHaveBeenCalled();
    expect(saveGamePlayer).not.toHaveBeenCalled();
    expect(result.sessionId).toBe('sess-1');
    expect(result.shareCode).toBe('abc12345');
    expect(result.createdBy).toBe('user-1');
  });

  it('returns a typed error when saveOwnSession fails', async () => {
    const saveOwnSession = vi.fn().mockResolvedValue(null);

    const result = await savePayoutSession({
      repo: {
        saveOwnSession,
        saveGameSession: vi.fn(),
        saveGamePlayer: vi.fn(),
        getGameSession: vi.fn(),
        getGroupMembersWithIds: vi.fn().mockResolvedValue([]),
        getGamePlayers: vi.fn(),
        deleteGamePlayer: vi.fn(),
      },
      userId: 'user-1',
      rows: [baseRow],
      buyIn: '30',
      currency: 'EUR',
      settlementMode: 'greedy',
      selectedGroupId: 'g1',
      currentSessionId: 'sess-reserved',
      status: 'settled',
      shareCode: null,
      useSharedRpc: false,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Upload failed. Please try again.',
    });
    expect(saveOwnSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sess-reserved', status: 'settled', group_id: 'g1' })
    );
  });

  it('uses shared RPC when useSharedRpc is true', async () => {
    const upsertSharedSession = vi.fn().mockResolvedValue('sess-shared');
    const saveOwnSession = vi.fn();

    const result = await savePayoutSession({
      repo: {
        saveOwnSession,
        saveGameSession: vi.fn(),
        saveGamePlayer: vi.fn(),
        getGameSession: vi.fn(),
        getGroupMembersWithIds: vi.fn().mockResolvedValue([]),
        getGamePlayers: vi.fn().mockResolvedValue([]),
        deleteGamePlayer: vi.fn(),
      },
      userId: 'user-2',
      rows: [baseRow],
      buyIn: '30',
      currency: 'EUR',
      settlementMode: 'greedy',
      selectedGroupId: null,
      currentSessionId: 'sess-shared',
      status: 'active',
      shareCode: 'abc12345',
      useSharedRpc: true,
      upsertSharedSession,
    });

    expect(result.ok).toBe(true);
    expect(upsertSharedSession).toHaveBeenCalledWith(
      'abc12345',
      expect.objectContaining({
        default_buy_in: '30',
        players: expect.arrayContaining([
          expect.objectContaining({ player_name: 'Alice', buy_in: 30, cash_out: 40 }),
        ]),
      })
    );
    expect(saveOwnSession).not.toHaveBeenCalled();
  });
});
