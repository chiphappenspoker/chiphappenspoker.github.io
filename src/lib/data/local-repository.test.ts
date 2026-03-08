import { describe, it, expect, beforeEach } from 'vitest';
import { localRepository } from './local-repository';
import { setLocalStorage } from '../storage/local-storage';
import { SESSIONS_STORAGE_KEY } from '../constants';
import type { DbGameSession } from '../types';

function makeSession(
  id: string,
  groupId: string | null,
  sessionDate: string,
  created_at: string
): DbGameSession {
  return {
    id,
    created_by: 'user-1',
    group_id: groupId,
    session_date: sessionDate,
    currency: 'EUR',
    default_buy_in: '30',
    settlement_mode: 'greedy',
    status: 'settled',
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
  });
});
