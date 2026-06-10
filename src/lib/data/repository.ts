import { SettingsData, UsualSuspect } from '../types';
import { DbGameSession, DbGamePlayer, DbGroup, SharedSessionPayload } from '../types';

export interface CreateGroupParams {
  name: string;
  currency?: string;
  default_buy_in?: string;
  settlement_mode?: string;
}

export interface UpdateGroupParams {
  id: string;
  name?: string;
  currency?: string;
  default_buy_in?: string;
  settlement_mode?: string;
}

export interface GroupMemberWithId {
  name: string;
  revtag: string;
  user_id: string;
}

export interface GameSessionsForUserFilters {
  groupId?: string;
  fromDate?: string;
  toDate?: string;
  participantUserId?: string;
}

export interface Repository {
  getSettings(): Promise<SettingsData | null>;
  saveSettings(data: SettingsData): Promise<void>;
  getGameSessions(): Promise<DbGameSession[]>;
  getGameSessionsForUser(filters?: GameSessionsForUserFilters): Promise<DbGameSession[]>;
  getGameSession(sessionId: string): Promise<DbGameSession | null>;
  saveGameSession(session: DbGameSession): Promise<DbGameSession | null>;
  getGamePlayers(sessionId: string): Promise<DbGamePlayer[]>;
  saveGamePlayer(player: DbGamePlayer): Promise<void>;
  deleteGamePlayer(playerId: string, sessionId: string): Promise<void>;
  getSessionByShareCode(shareCode: string): Promise<{ session: DbGameSession; players: DbGamePlayer[] } | null>;
  upsertSharedSession(shareCode: string, payload: SharedSessionPayload): Promise<string | null>;
  getGroups(): Promise<DbGroup[]>;
  getGroupByInviteCode(inviteCode: string): Promise<DbGroup | null>;
  getGroupMembers(groupId: string): Promise<UsualSuspect[]>;
  getGroupMembersWithIds(groupId: string): Promise<GroupMemberWithId[]>;
  createGroup(params: CreateGroupParams): Promise<DbGroup>;
  updateGroup(params: UpdateGroupParams): Promise<DbGroup>;
  deleteGroup(groupId: string): Promise<void>;
  addGroupMember(groupId: string, userId: string): Promise<void>;
  removeGroupMember(groupId: string, userId: string): Promise<void>;
}
