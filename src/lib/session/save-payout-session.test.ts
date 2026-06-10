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
  it('saves active session via creator path', async () => {
    const saveGameSession = vi.fn().mockResolvedValue(undefined);
    const saveGamePlayer = vi.fn().mockResolvedValue(undefined);
    const getGameSession = vi.fn().mockResolvedValue({
      id: 'sess-1',
      share_code: 'abc12345',
      created_by: 'user-1',
      group_id: null,
      session_date: '2026-06-10',
      currency: 'EUR',
      default_buy_in: '30',
      settlement_mode: 'greedy',
      status: 'active',
      created_at: '',
      updated_at: '',
    });
    const getGroupMembersWithIds = vi.fn().mockResolvedValue([]);
    const getGamePlayers = vi.fn().mockResolvedValue([]);
    const deleteGamePlayer = vi.fn();

    const result = await savePayoutSession({
      repo: { saveGameSession, saveGamePlayer, getGameSession, getGroupMembersWithIds, getGamePlayers, deleteGamePlayer },
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
    expect(saveGameSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', created_by: 'user-1' })
    );
    expect(result.sessionId).toBeTruthy();
    expect(result.createdBy).toBe('user-1');
    if (result.ok) expect(result.shareCode).toBe('abc12345');
  });

  it('uses shared RPC when useSharedRpc is true', async () => {
    const upsertSharedSession = vi.fn().mockResolvedValue('sess-shared');
    const saveGameSession = vi.fn();

    const result = await savePayoutSession({
      repo: {
        saveGameSession,
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
    expect(saveGameSession).not.toHaveBeenCalled();
  });
});
