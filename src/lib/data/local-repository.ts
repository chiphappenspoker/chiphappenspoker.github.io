import { Repository, CreateGroupParams, UpdateGroupParams, GroupMemberWithId } from './repository';
import { SettingsData, DbGameSession, DbGamePlayer, DbGroup } from '../types';
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
  async saveGameSession(session) {
    if (!useDexie()) {
      const sessions = getLocalStorage<DbGameSession[]>(SESSIONS_STORAGE_KEY) ?? [];
      setLocalStorage(SESSIONS_STORAGE_KEY, [...sessions, session]);
      return;
    }
    await db.sessions.put(session);
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
