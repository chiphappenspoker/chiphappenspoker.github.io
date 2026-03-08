import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbGameSession, DbGamePlayer } from '../types';
import type { GameSessionsForUserFilters } from './repository';

const mockPlayer: DbGamePlayer = {
  id: 'p1',
  session_id: 's1',
  user_id: 'user-1',
  player_name: 'Alice',
  buy_in: 30,
  cash_out: 50,
  net_result: 20,
  settled: true,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
};

const mockSession1: DbGameSession = {
  id: 's1',
  created_by: 'user-1',
  group_id: 'g1',
  session_date: '2026-03-01',
  currency: 'EUR',
  default_buy_in: '30',
  settlement_mode: 'greedy',
  status: 'settled',
  share_code: '',
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
};
const mockSession2: DbGameSession = {
  id: 's2',
  created_by: 'user-1',
  group_id: null,
  session_date: '2026-03-02',
  currency: 'EUR',
  default_buy_in: '30',
  settlement_mode: 'greedy',
  status: 'settled',
  share_code: '',
  created_at: '2026-03-02T11:00:00Z',
  updated_at: '2026-03-02T11:00:00Z',
};

const mockGetGameSessionsForUserCloud = vi.fn<(_?: GameSessionsForUserFilters) => Promise<DbGameSession[]>>();
const mockGetGameSessionsForUserLocal = vi.fn<(_?: GameSessionsForUserFilters) => Promise<DbGameSession[]>>();
const mockGetGamePlayersLocal = vi.fn<(_: string) => Promise<DbGamePlayer[]>>();
const mockGetGamePlayersCloud = vi.fn<(_: string) => Promise<DbGamePlayer[]>>();
const mockGetGameSessionLocal = vi.fn<(_: string) => Promise<DbGameSession | null>>();
const mockGetGameSessionCloud = vi.fn<(_: string) => Promise<DbGameSession | null>>();

vi.mock('./cloud-repository', () => ({
  cloudRepository: {
    getGameSessionsForUser: (f?: GameSessionsForUserFilters) => mockGetGameSessionsForUserCloud(f),
    getGameSession: (sessionId: string) => mockGetGameSessionCloud(sessionId),
    getGamePlayers: (sessionId: string) => mockGetGamePlayersCloud(sessionId),
  },
}));
vi.mock('./local-repository', () => ({
  localRepository: {
    getGameSessions: vi.fn(),
    getGameSessionsForUser: (f?: GameSessionsForUserFilters) => mockGetGameSessionsForUserLocal(f),
    getGameSession: (sessionId: string) => mockGetGameSessionLocal(sessionId),
    saveGameSession: vi.fn(),
    getGamePlayers: (sessionId: string) => mockGetGamePlayersLocal(sessionId),
    saveGamePlayer: vi.fn(),
    deleteGamePlayer: vi.fn(),
    getGroups: vi.fn(),
    getGroupByInviteCode: vi.fn(),
    getGroupMembers: vi.fn(),
    getGroupMembersWithIds: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
  },
}));

describe('sync-repository getGameSessionsForUser', () => {
  beforeEach(() => {
    mockGetGameSessionsForUserCloud.mockReset();
    mockGetGameSessionsForUserLocal.mockReset();
  });

  it('returns merged sessions from local and cloud, deduped by id', async () => {
    mockGetGameSessionsForUserCloud.mockResolvedValue([mockSession2]);
    mockGetGameSessionsForUserLocal.mockResolvedValue([mockSession1, mockSession2]);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const list = await repo.getGameSessionsForUser();

    expect(mockGetGameSessionsForUserLocal).toHaveBeenCalled();
    expect(mockGetGameSessionsForUserCloud).toHaveBeenCalled();
    expect(list).toHaveLength(2);
    const ids = list.map((s) => s.id).sort();
    expect(ids).toEqual(['s1', 's2']);
  });

  it('includes local-only sessions when cloud returns empty', async () => {
    mockGetGameSessionsForUserCloud.mockResolvedValue([]);
    mockGetGameSessionsForUserLocal.mockResolvedValue([mockSession1]);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const list = await repo.getGameSessionsForUser();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('s1');
  });

  it('applies filters to merged result', async () => {
    mockGetGameSessionsForUserCloud.mockResolvedValue([mockSession2]);
    mockGetGameSessionsForUserLocal.mockResolvedValue([mockSession1, mockSession2]);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const list = await repo.getGameSessionsForUser({ groupId: 'g1' });

    expect(mockGetGameSessionsForUserLocal).toHaveBeenCalledWith({ groupId: 'g1' });
    expect(mockGetGameSessionsForUserCloud).toHaveBeenCalledWith({ groupId: 'g1' });
    expect(list.every((s) => s.group_id === 'g1')).toBe(true);
    expect(list.map((s) => s.id)).toContain('s1');
  });
});

describe('sync-repository getGamePlayers', () => {
  beforeEach(() => {
    mockGetGamePlayersLocal.mockReset();
    mockGetGamePlayersCloud.mockReset();
  });

  it('returns cloud players when local returns empty (cloud-only session)', async () => {
    mockGetGamePlayersLocal.mockResolvedValue([]);
    mockGetGamePlayersCloud.mockResolvedValue([mockPlayer]);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const players = await repo.getGamePlayers('s1');

    expect(mockGetGamePlayersLocal).toHaveBeenCalledWith('s1');
    expect(mockGetGamePlayersCloud).toHaveBeenCalledWith('s1');
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe('p1');
    expect(players[0].player_name).toBe('Alice');
  });

  it('returns local players when local has data (prefer local)', async () => {
    const localPlayer = { ...mockPlayer, id: 'p-local', player_name: 'Local Alice' };
    mockGetGamePlayersLocal.mockResolvedValue([localPlayer]);
    mockGetGamePlayersCloud.mockResolvedValue([mockPlayer]);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const players = await repo.getGamePlayers('s1');

    expect(players).toHaveLength(1);
    expect(players[0].id).toBe('p-local');
  });
});

describe('sync-repository getGameSession', () => {
  beforeEach(() => {
    mockGetGameSessionLocal.mockReset();
    mockGetGameSessionCloud.mockReset();
  });

  it('returns local session when available (local-first)', async () => {
    mockGetGameSessionLocal.mockResolvedValue(mockSession1);
    mockGetGameSessionCloud.mockResolvedValue(null);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const session = await repo.getGameSession('s1');

    expect(mockGetGameSessionLocal).toHaveBeenCalledWith('s1');
    expect(session?.id).toBe('s1');
  });

  it('returns cloud session when local returns null', async () => {
    mockGetGameSessionLocal.mockResolvedValue(null);
    mockGetGameSessionCloud.mockResolvedValue(mockSession2);

    const { getRepository } = await import('./sync-repository');
    const repo = getRepository(true);
    const session = await repo.getGameSession('s2');

    expect(mockGetGameSessionCloud).toHaveBeenCalledWith('s2');
    expect(session?.id).toBe('s2');
  });
});
