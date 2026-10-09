import { Repository, CreateGroupParams, UpdateGroupParams, GroupMemberWithId, GameSessionsForUserFilters } from './repository';
import {
  SettingsData,
  DbGameSession,
  DbGamePlayer,
  DbGroup,
  SaveOwnSessionPayload,
  SaveOwnSessionResult,
} from '../types';
import { getLocalStorage, setLocalStorage } from '../storage/local-storage';
import { SETTINGS_STORAGE_KEY, SESSIONS_STORAGE_KEY, SESSION_PLAYERS_STORAGE_KEY } from '../constants';
import { db } from '../sync/db';

function useDexie(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

export const localRepository: Repository = {
  async getSettings() {
    return getLocalStorage<SettingsData>(SETTINGS_STORAGE_KEY);
  },
  async saveSettings(data) {
    setLocalStorage(SETTINGS_STORAGE_KEY, data);
  },
  async getGameSessions() {
    if (!useDexie()) return getLocalStorage<DbGameSession[]>(SESSIONS_STORAGE_KEY) ?? [];
    const list = await db.sessions.orderBy('created_at').reverse().toArray();
    return list;
  },
  async getGameSessionsForUser(filters?: GameSessionsForUserFilters): Promise<DbGameSession[]> {
    const list = (await this.getGameSessions()).filter((s) => s.status !== 'active');
    if (!filters) return list;
    let out = list;
    if (filters.participantUserId) {
      if (!useDexie()) {
        const all = getLocalStorage<Record<string, DbGamePlayer[]>>(SESSION_PLAYERS_STORAGE_KEY) ?? {};
        const matchingSessionIds = new Set<string>();
        for (const [sessionId, players] of Object.entries(all)) {
          if (players.some((player) => player.user_id === filters.participantUserId)) {
            matchingSessionIds.add(sessionId);
          }
        }
        out = out.filter((session) => matchingSessionIds.has(session.id));
      } else {
        const players = await db.players.toArray();
        const matchingSessionIds = new Set(
          players
            .filter((player) => player.user_id === filters.participantUserId)
            .map((player) => player.session_id)
        );
        out = out.filter((session) => matchingSessionIds.has(session.id));
      }
    }
    if (filters.groupId != null) out = out.filter((s) => s.group_id === filters!.groupId);
    if (filters.fromDate != null) out = out.filter((s) => s.session_date >= filters!.fromDate!);
    if (filters.toDate != null) out = out.filter((s) => s.session_date <= filters!.toDate!);
    return out;
  },
  async getGameSession(sessionId: string): Promise<DbGameSession | null> {
    if (useDexie()) return (await db.sessions.get(sessionId)) ?? null;
    const sessions = getLocalStorage<DbGameSession[]>(SESSIONS_STORAGE_KEY) ?? [];
    return sessions.find((s) => s.id === sessionId) ?? null;
  },
  async saveGameSession(session) {
    if (!useDexie()) {
      const sessions = getLocalStorage<DbGameSession[]>(SESSIONS_STORAGE_KEY) ?? [];
      setLocalStorage(SESSIONS_STORAGE_KEY, [...sessions, session]);
      return session;
    }
    await db.sessions.put(session);
    return session;
  },
  async getGamePlayers(sessionId) {
    if (!useDexie()) {
      const all = getLocalStorage<Record<string, DbGamePlayer[]>>(SESSION_PLAYERS_STORAGE_KEY) ?? {};
      return all[sessionId] ?? [];
    }
    return db.players.where('session_id').equals(sessionId).toArray();
  },
  async saveGamePlayer(player) {
    if (!useDexie()) {
      const all = getLocalStorage<Record<string, DbGamePlayer[]>>(SESSION_PLAYERS_STORAGE_KEY) ?? {};
      const arr = all[player.session_id] ?? [];
      all[player.session_id] = [...arr, player];
      setLocalStorage(SESSION_PLAYERS_STORAGE_KEY, all);
      return;
    }
    await db.players.put(player);
  },

  async deleteGamePlayer(playerId: string, sessionId: string) {
    if (!useDexie()) {
      const all = getLocalStorage<Record<string, DbGamePlayer[]>>(SESSION_PLAYERS_STORAGE_KEY) ?? {};
      const arr = (all[sessionId] ?? []).filter((p) => p.id !== playerId);
      if (arr.length === 0) delete all[sessionId];
      else all[sessionId] = arr;
      setLocalStorage(SESSION_PLAYERS_STORAGE_KEY, all);
      return;
    }
    await db.players.delete(playerId);
  },

  async getGroups() {
    return []; // local-only: no groups (groups are cloud-only)
  },
  async getGroupByInviteCode(): Promise<DbGroup | null> {
    return Promise.resolve(null);
  },
  async getSessionByShareCode() {
    return null;
  },
  async upsertSharedSession() {
    return null;
  },
  async saveOwnSession(payload: SaveOwnSessionPayload): Promise<SaveOwnSessionResult | null> {
    const now = new Date().toISOString();
    const shareCode =
      (await this.getGameSession(payload.id))?.share_code?.trim() ||
      Math.random().toString(36).slice(2, 10);
    await this.saveGameSession({
      id: payload.id,
      created_by: '',
      group_id: payload.group_id,
      session_date: payload.session_date,
      currency: payload.currency,
      default_buy_in: payload.default_buy_in,
      settlement_mode: payload.settlement_mode,
      status: payload.status,
      share_code: shareCode,
      created_at: now,
      updated_at: now,
    });
    const existing = await this.getGamePlayers(payload.id);
    const kept = new Set(payload.players.map((p) => p.id));
    for (const p of existing) {
      if (!kept.has(p.id)) await this.deleteGamePlayer(p.id, payload.id);
    }
    for (const p of payload.players) {
      await this.saveGamePlayer({
        id: p.id,
        session_id: payload.id,
        user_id: p.user_id,
        player_name: p.player_name,
        buy_in: p.buy_in,
        cash_out: p.cash_out,
        net_result: p.net_result,
        settled: p.settled,
        created_at: p.created_at,
        updated_at: now,
      });
    }
    return { session_id: payload.id, share_code: shareCode };
  },
  async getGroupMembers() {
    return [];
  },
  async getGroupMembersWithIds(): Promise<GroupMemberWithId[]> {
    return [];
  },
  async createGroup(_params: CreateGroupParams): Promise<DbGroup> {
    throw new Error('Sign in to create groups');
  },
  async updateGroup(_params: UpdateGroupParams): Promise<DbGroup> {
    throw new Error('Sign in to update groups');
  },
  async deleteGroup(_groupId: string): Promise<void> {
    throw new Error('Sign in to delete groups');
  },
  async addGroupMember() {
    // no-op when local-only
  },
  async removeGroupMember(_groupId: string, _userId: string): Promise<void> {
    throw new Error('Sign in to remove members');
  },
};
