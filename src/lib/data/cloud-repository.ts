import { Repository, CreateGroupParams, UpdateGroupParams, GroupMemberWithId, GameSessionsForUserFilters } from './repository';
import { supabase } from '../supabase/client';
import {
  SettingsData,
  DbGameSession,
  DbGamePlayer,
  DbGroup,
  UsualSuspect,
} from '../types';

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function mapProfileToSettingsData(row: {
  display_name: string;
  revtag: string;
  currency: string;
  default_buy_in: string;
  settlement_mode: string;
  leaderboard_opt_out?: boolean | null;
}): SettingsData {
  return {
    profile: {
      name: row.display_name ?? '',
      revtag: row.revtag ?? '',
      leaderboardOptOut: Boolean(row.leaderboard_opt_out),
    },
    usualSuspects: [], // derived from group at runtime
    gameSettings: {
      currency: row.currency ?? 'EUR',
      defaultBuyIn: row.default_buy_in ?? '30',
      settlementMode: (row.settlement_mode === 'greedy' ? 'greedy' : 'banker') as 'banker' | 'greedy',
    },
  };
}

export const cloudRepository: Repository = {
  async getSettings() {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, revtag, currency, default_buy_in, settlement_mode, leaderboard_opt_out')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return mapProfileToSettingsData(data);
  },

  async saveSettings(data: SettingsData) {
    const userId = await getCurrentUserId();
    if (!userId) return;
    await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          display_name: data.profile.name,
          revtag: data.profile.revtag,
          currency: data.gameSettings.currency,
          default_buy_in: data.gameSettings.defaultBuyIn,
          settlement_mode: data.gameSettings.settlementMode,
          leaderboard_opt_out: data.profile.leaderboardOptOut,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
  },

  async getGameSessions() {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as DbGameSession[];
  },

  async getGameSessionsForUser(filters?: GameSessionsForUserFilters): Promise<DbGameSession[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const byId = new Map<string, DbGameSession>();

    const { data: createdData, error: createdError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('created_by', userId);
    if (!createdError && createdData?.length) {
      for (const row of createdData as DbGameSession[]) byId.set(row.id, row);
    }

    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    const memberGroupIds = (memberRows ?? []).map((r) => r.group_id).filter(Boolean) as string[];
    if (memberGroupIds.length > 0) {
      const { data: groupSessions, error: groupError } = await supabase
        .from('game_sessions')
        .select('*')
        .in('group_id', memberGroupIds);
      if (!groupError && groupSessions?.length) {
        for (const row of groupSessions as DbGameSession[]) {
          if (!byId.has(row.id)) byId.set(row.id, row);
        }
      }
    }

    let list = Array.from(byId.values());

    if (filters?.groupId) list = list.filter((s) => s.group_id === filters.groupId);
    if (filters?.fromDate) list = list.filter((s) => s.session_date >= filters!.fromDate!);
    if (filters?.toDate) list = list.filter((s) => s.session_date <= filters!.toDate!);

    list.sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0));
    return list;
  },

  async getGameSession(sessionId: string): Promise<DbGameSession | null> {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (error || !data) return null;
    return data as DbGameSession;
  },

  async saveGameSession(session: DbGameSession) {
    await supabase.from('game_sessions').upsert(
      {
        id: session.id,
        created_by: session.created_by,
        group_id: session.group_id,
        session_date: session.session_date,
        currency: session.currency,
        default_buy_in: session.default_buy_in,
        settlement_mode: session.settlement_mode,
        status: session.status,
        share_code: session.share_code ?? '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  },

  async getGamePlayers(sessionId: string) {
    const { data, error } = await supabase
      .from('game_players')
      .select('*')
      .eq('session_id', sessionId);
    if (error) return [];
    return (data ?? []) as DbGamePlayer[];
  },

  async saveGamePlayer(player: DbGamePlayer) {
    await supabase.from('game_players').upsert(
      {
        id: player.id,
        session_id: player.session_id,
        user_id: player.user_id,
        player_name: player.player_name,
        buy_in: player.buy_in,
        cash_out: player.cash_out,
        net_result: player.net_result,
        settled: player.settled,
      },
      { onConflict: 'id' }
    );
  },

  async deleteGamePlayer(playerId: string, _sessionId: string) {
    await supabase.from('game_players').delete().eq('id', playerId);
  },

  async getGroupByInviteCode(inviteCode: string): Promise<DbGroup | null> {
    const code = (inviteCode ?? '').trim();
    if (!code) return null;
    const { data, error } = await supabase.rpc('get_group_by_invite_code', {
      p_invite_code: code,
    });
    if (error) return null;
    // PostgREST returns array for setof; handle single object in case of one row
    if (Array.isArray(data) && data.length > 0) return data[0] as DbGroup;
    if (data && typeof data === 'object' && !Array.isArray(data) && 'id' in data)
      return data as DbGroup;
    return null;
  },

  async getGroups() {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    // Groups where user is creator or member
    const { data: created } = await supabase
      .from('groups')
      .select('*')
      .eq('created_by', userId);
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    const memberIds = (memberRows ?? []).map((r) => r.group_id);
    if (memberIds.length === 0 && (created ?? []).length === 0) {
      return (created ?? []) as DbGroup[];
    }
    let all = (created ?? []) as DbGroup[];
    if (memberIds.length > 0) {
      const { data: memberGroups } = await supabase
        .from('groups')
        .select('*')
        .in('id', memberIds);
      const createdIds = new Set(all.map((g) => g.id));
      for (const g of memberGroups ?? []) {
        if (!createdIds.has(g.id)) all.push(g as DbGroup);
      }
    }
    return all;
  },

  async getGroupMembers(groupId: string): Promise<UsualSuspect[]> {
    const withIds = await this.getGroupMembersWithIds(groupId);
    return withIds.map(({ name, revtag }) => ({ name, revtag }));
  },

  async getGroupMembersWithIds(groupId: string): Promise<GroupMemberWithId[]> {
    const { data: members, error } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    if (error || !members?.length) return [];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, revtag')
      .in('id', members.map((m) => m.user_id));
    const count = (profiles ?? []).length;
    if (count < members.length && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(
        `[ChipHappens] group_members has ${members.length} member(s) but profiles returned ${count}. ` +
          'If some members are missing in the UI, ensure migration 20260301000001_profiles_select_group_members.sql is applied on your Supabase project (run: npm run supabase:db:push).'
      );
    }
    return (profiles ?? []).map((p) => ({
      name: p.display_name ?? '',
      revtag: p.revtag ?? '',
      user_id: p.id,
    }));
  },

  async createGroup(params: CreateGroupParams): Promise<DbGroup> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('groups')
      .insert({
        name: params.name,
        currency: params.currency ?? 'EUR',
        default_buy_in: params.default_buy_in ?? '30',
        settlement_mode: params.settlement_mode ?? 'greedy',
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    const group = data as DbGroup;
    const { error: memberError } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: userId,
      role: 'admin',
    });
    if (memberError) throw memberError;
    return group;
  },

  async updateGroup(params: UpdateGroupParams): Promise<DbGroup> {
    const { id, ...updates } = params;
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.default_buy_in !== undefined) payload.default_buy_in = updates.default_buy_in;
    if (updates.settlement_mode !== undefined) payload.settlement_mode = updates.settlement_mode;
    const { data, error } = await supabase.from('groups').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data as DbGroup;
  },

  async deleteGroup(groupId: string): Promise<void> {
    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) throw error;
  },

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: userId,
    });
    if (error) throw error;
  },

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
  },
};
