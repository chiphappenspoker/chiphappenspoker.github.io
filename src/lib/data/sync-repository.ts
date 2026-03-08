import { Repository, CreateGroupParams, UpdateGroupParams } from './repository';
import { localRepository } from './local-repository';
import { cloudRepository } from './cloud-repository';
import { enqueue } from '../sync/sync-queue';
import type { SettingsData } from '../types';
import type { DbGameSession, DbGamePlayer, DbGroup } from '../types';
import type { UsualSuspect } from '../types';
import type { GroupMemberWithId, GameSessionsForUserFilters } from './repository';

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
  async getGameSessionsForUser(filters?: GameSessionsForUserFilters) {
    const [localList, cloudList] = await Promise.all([
      localRepository.getGameSessionsForUser(filters),
      cloudRepository.getGameSessionsForUser(filters),
    ]);
    const byId = new Map<string, DbGameSession>();
    for (const s of [...localList, ...cloudList]) byId.set(s.id, s);
    let list = Array.from(byId.values());
    if (filters?.groupId) list = list.filter((s) => s.group_id === filters.groupId);
    if (filters?.fromDate) list = list.filter((s) => s.session_date >= filters!.fromDate!);
    if (filters?.toDate) list = list.filter((s) => s.session_date <= filters!.toDate!);
    list.sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0));
    return list;
  },
  async getGameSession(sessionId: string) {
    const local = await localRepository.getGameSession(sessionId);
    if (local) return local;
    return cloudRepository.getGameSession(sessionId);
  },
  async saveGameSession(session: DbGameSession) {
    await localRepository.saveGameSession(session);
    await enqueue('game_sessions', 'upsert', session as unknown as Record<string, unknown>);
    if (isOnline()) await cloudRepository.saveGameSession(session);
  },
  async getGamePlayers(sessionId: string) {
    const local = await localRepository.getGamePlayers(sessionId);
    if (local.length > 0) return local;
    return cloudRepository.getGamePlayers(sessionId);
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
  async getGroupByInviteCode(inviteCode: string): Promise<DbGroup | null> {
    return cloudRepository.getGroupByInviteCode(inviteCode);
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
