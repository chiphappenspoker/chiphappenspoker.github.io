import { supabase } from '../supabase/client';
import type { LeaderboardRow, PlayerStats } from '../types';

export interface CumulativePnlPoint {
  date: string;
  cumulativeProfit: number;
}

/**
 * Fetches cumulative PnL over time for a user.
 * Sessions: created_by = userId or group member; optional group/date filters.
 * Returns points { date, cumulativeProfit } sorted by date ascending.
 */
export async function getCumulativePnl(
  userId: string,
  groupId?: string | null,
  fromDate?: string,
  toDate?: string
): Promise<CumulativePnlPoint[]> {
  const byId = new Map<string, { session_date: string; group_id: string | null }>();

  const { data: createdData, error: createdError } = await supabase
    .from('game_sessions')
    .select('id, session_date, group_id')
    .eq('created_by', userId);
  if (!createdError && createdData?.length) {
    for (const row of createdData as { id: string; session_date: string; group_id: string | null }[]) {
      byId.set(row.id, { session_date: row.session_date, group_id: row.group_id });
    }
  }

  const { data: memberRows } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);
  const memberGroupIds = (memberRows ?? []).map((r) => r.group_id).filter(Boolean) as string[];
  if (memberGroupIds.length > 0) {
    const { data: groupSessions, error: groupError } = await supabase
      .from('game_sessions')
      .select('id, session_date, group_id')
      .in('group_id', memberGroupIds);
    if (!groupError && groupSessions?.length) {
      for (const row of groupSessions as { id: string; session_date: string; group_id: string | null }[]) {
        if (!byId.has(row.id)) byId.set(row.id, { session_date: row.session_date, group_id: row.group_id });
      }
    }
  }

  let list = Array.from(byId.entries()).map(([id, { session_date, group_id }]) => ({ id, session_date, group_id }));

  if (groupId != null && groupId !== '') {
    list = list.filter((s) => s.group_id === groupId);
  }
  if (fromDate) list = list.filter((s) => s.session_date >= fromDate);
  if (toDate) list = list.filter((s) => s.session_date <= toDate);

  list.sort((a, b) => (a.session_date < b.session_date ? -1 : a.session_date > b.session_date ? 1 : 0));

  const result: CumulativePnlPoint[] = [];
  let cumulative = 0;

  for (const session of list) {
    const { data: players } = await supabase
      .from('game_players')
      .select('net_result')
      .eq('session_id', session.id)
      .eq('user_id', userId);
    const sessionProfit = (players ?? []).reduce((sum, p) => sum + Number((p as { net_result: number }).net_result), 0);
    cumulative += sessionProfit;
    result.push({ date: session.session_date, cumulativeProfit: cumulative });
  }

  return result;
}

/**
 * Fetches player stats for a user, optionally filtered by group and date range.
 * Returns one row per (user_id, group_id). Pass groupId undefined/null for all groups.
 * On error returns empty array.
 */
export async function getPlayerStats(
  userId: string,
  groupId?: string | null,
  fromDate?: string,
  toDate?: string
): Promise<PlayerStats[]> {
  const { data, error } = await supabase.rpc('get_player_stats', {
    p_user_id: userId,
    p_group_id: groupId ?? null,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? null,
  });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    user_id: string;
    group_id: string | null;
    total_sessions: number | string;
    total_profit: number | string;
    biggest_win: number | string;
    biggest_loss: number | string;
    win_count: number | string;
    loss_count: number | string;
    avg_profit: number | string;
    last_played: string | null;
  }>;
  return rows.map((r) => ({
    user_id: r.user_id,
    group_id: r.group_id ?? null,
    total_sessions: Number(r.total_sessions),
    total_profit: Number(r.total_profit),
    biggest_win: Number(r.biggest_win),
    biggest_loss: Number(r.biggest_loss),
    win_count: Number(r.win_count),
    loss_count: Number(r.loss_count),
    avg_profit: Number(r.avg_profit),
    last_played: r.last_played ?? null,
  }));
}

/**
 * Fetches leaderboard rows for a group, optionally filtered by date range.
 * Requires the current user to be a member of the group (RLS on game_sessions).
 */
export async function getGroupLeaderboard(
  groupId: string,
  fromDate?: string,
  toDate?: string
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_group_leaderboard', {
    p_from_date: fromDate || null,
    p_group_id: groupId,
    p_to_date: toDate || null,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    total_profit: number;
    total_sessions: number;
    win_count: number;
    loss_count: number;
  }>;
  return rows.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name ?? '',
    total_profit: Number(r.total_profit),
    total_sessions: Number(r.total_sessions),
    win_count: Number(r.win_count),
    loss_count: Number(r.loss_count),
  }));
}
