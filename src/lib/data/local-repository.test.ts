import { describe, it, expect, beforeEach } from 'vitest';
import { localRepository } from './local-repository';
import { setLocalStorage } from '../storage/local-storage';
import { SESSIONS_STORAGE_KEY, SESSION_PLAYERS_STORAGE_KEY } from '../constants';
import type { DbGameSession } from '../types';

function makeSession(
  id: string,
  groupId: string | null,
  sessionDate: string,
  created_at: string,
  status: string = 'settled'
): DbGameSession {
  return {
    id,
    created_by: 'user-1',
    group_id: groupId,
    session_date: sessionDate,
    currency: 'EUR',
    default_buy_in: '30',
    settlement_mode: 'greedy',
    status,
    share_code: '',
    created_at,
    updated_at: created_at,
  };
}

describe('localRepository', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('getGroupByInviteCode', () => {
    it('returns null (groups are cloud-only)', async () => {
      const result = await localRepository.getGroupByInviteCode('abc123');
      expect(result).toBeNull();
    });
  });

  describe('getGroups', () => {
    it('returns empty array', async () => {
      const result = await localRepository.getGroups();
      expect(result).toEqual([]);
    });
  });

  describe('createGroup', () => {
    it('throws with sign-in message', async () => {
      await expect(
        localRepository.createGroup({ name: 'Test' })
      ).rejects.toThrow('Sign in to create groups');
    });
  });

  describe('getGameSessionsForUser', () => {
    it('applies groupId filter when sessions in localStorage', async () => {
      const sessions: DbGameSession[] = [
        makeSession('s1', 'g1', '2026-03-01', '2026-03-01T10:00:00Z'),
        makeSession('s2', 'g2', '2026-03-02', '2026-03-02T10:00:00Z'),
        makeSession('s3', 'g1', '2026-03-03', '2026-03-03T10:00:00Z'),
      ];
      setLocalStorage(SESSIONS_STORAGE_KEY, sessions);

      const result = await localRepository.getGameSessionsForUser({ groupId: 'g1' });
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id).sort()).toEqual(['s1', 's3']);
    });

    it('applies fromDate and toDate filters', async () => {
      const sessions: DbGameSession[] = [
        makeSession('s1', null, '2026-03-01', '2026-03-01T10:00:00Z'),
        makeSession('s2', null, '2026-03-05', '2026-03-05T10:00:00Z'),
        makeSession('s3', null, '2026-03-10', '2026-03-10T10:00:00Z'),
      ];
      setLocalStorage(SESSIONS_STORAGE_KEY, sessions);

      const result = await localRepository.getGameSessionsForUser({
        fromDate: '2026-03-03',
        toDate: '2026-03-07',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s2');
    });

    it('returns all sessions when no filters', async () => {
      const sessions: DbGameSession[] = [
        makeSession('s1', null, '2026-03-01', '2026-03-01T10:00:00Z'),
      ];
      setLocalStorage(SESSIONS_STORAGE_KEY, sessions);
      const result = await localRepository.getGameSessionsForUser();
      expect(result).toHaveLength(1);
    });

    it('excludes active sessions from getGameSessionsForUser', async () => {
      const sessions: DbGameSession[] = [
        makeSession('active-1', null, '2026-06-10', '2026-06-10T10:00:00Z', 'active'),
        makeSession('settled-1', null, '2026-06-09', '2026-06-09T10:00:00Z', 'settled'),
      ];
      setLocalStorage(SESSIONS_STORAGE_KEY, sessions);

      const result = await localRepository.getGameSessionsForUser();

      expect(result.map((s) => s.id)).toEqual(['settled-1']);
    });

    it('applies participantUserId filter from game_players rows', async () => {
      const sessions: DbGameSession[] = [
        makeSession('s1', null, '2026-03-01', '2026-03-01T10:00:00Z'),
        makeSession('s2', null, '2026-03-02', '2026-03-02T10:00:00Z'),
      ];
      setLocalStorage(SESSIONS_STORAGE_KEY, sessions);
      setLocalStorage(SESSION_PLAYERS_STORAGE_KEY, {
        s1: [
          {
            id: 'p1',
            session_id: 's1',
            user_id: 'u1',
            player_name: 'U1',
            buy_in: 30,
            cash_out: 40,
            net_result: 10,
            settled: true,
            created_at: '2026-03-01T10:00:00Z',
            updated_at: '2026-03-01T10:00:00Z',
          },
        ],
        s2: [
          {
            id: 'p2',
            session_id: 's2',
            user_id: 'u2',
            player_name: 'U2',
            buy_in: 30,
            cash_out: 20,
            net_result: -10,
            settled: true,
            created_at: '2026-03-02T10:00:00Z',
            updated_at: '2026-03-02T10:00:00Z',
          },
        ],
      });

      const result = await localRepository.getGameSessionsForUser({ participantUserId: 'u1' });
      expect(result.map((s) => s.id)).toEqual(['s1']);
    });
  });
});
