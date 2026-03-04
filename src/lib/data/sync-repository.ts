import { Repository, CreateGroupParams, UpdateGroupParams } from './repository';
import { localRepository } from './local-repository';
import { cloudRepository } from './cloud-repository';
import { enqueue } from '../sync/sync-queue';
import type { SettingsData } from '../types';
import type { DbGameSession, DbGamePlayer, DbGroup } from '../types';
import type { UsualSuspect } from '../types';
import type { GroupMemberWithId } from './repository';

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

const syncRepository: Repository = {
  async getSettings() {
    return cloudRepository.getSettings();
  },
  async saveSettings(data: SettingsData) {
    await localRepository.saveSettings(data);
    await enqueue('profiles', 'upsert', data as unknown as Record<string, unknown>);
    if (isOnline()) await cloudRepository.saveSettings(data);
  },
  async getGameSessions() {
    return localRepository.getGameSessions();
  },
  async saveGameSession(session: DbGameSession) {
    await localRepository.saveGameSession(session);
    await enqueue('game_sessions', 'upsert', session as unknown as Record<string, unknown>);
    if (isOnline()) await cloudRepository.saveGameSession(session);
  },
  async getGamePlayers(sessionId: string) {
    return localRepository.getGamePlayers(sessionId);
  },
  async saveGamePlayer(player: DbGamePlayer) {
    await localRepository.saveGamePlayer(player);
    await enqueue('game_players', 'upsert', player as unknown as Record<string, unknown>);
    if (isOnline()) await cloudRepository.saveGamePlayer(player);
  },

  async deleteGamePlayer(playerId: string, sessionId: string) {
    await localRepository.deleteGamePlayer(playerId, sessionId);
    if (isOnline()) await cloudRepository.deleteGamePlayer(playerId, sessionId);
  },

  async getGroups(): Promise<DbGroup[]> {
    return cloudRepository.getGroups();
  },
  async getGroupMembers(groupId: string): Promise<UsualSuspect[]> {
    return cloudRepository.getGroupMembers(groupId);
  },
  async getGroupMembersWithIds(groupId: string): Promise<GroupMemberWithId[]> {
    return cloudRepository.getGroupMembersWithIds(groupId);
  },
  async createGroup(params: CreateGroupParams): Promise<DbGroup> {
    return cloudRepository.createGroup(params);
  },
  async updateGroup(params: UpdateGroupParams): Promise<DbGroup> {
    return cloudRepository.updateGroup(params);
  },
  async deleteGroup(groupId: string): Promise<void> {
    return cloudRepository.deleteGroup(groupId);
  },
  async addGroupMember(groupId: string, userId: string): Promise<void> {
    return cloudRepository.addGroupMember(groupId, userId);
  },
  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    return cloudRepository.removeGroupMember(groupId, userId);
  },
};

export function getRepository(loggedIn: boolean): Repository {
  return loggedIn ? syncRepository : localRepository;
}
