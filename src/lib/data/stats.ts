import { supabase } from '../supabase/client';
import type { LeaderboardRow, PlayerStats } from '../types';

export type CombinedPlayerStats = {
  total_sessions: number;
  total_profit: number;
  biggest_win: number;
  biggest_loss: number;
  win_count: number;
  loss_count: number;
  avg_profit: number;
  avg_win: number;
  avg_loss: number;
  last_played: string | null;
};

/** Combine multiple PlayerStats rows (e.g. one per group) into one view. */
export function combinePlayerStats(rows: PlayerStats[]): CombinedPlayerStats {
  if (rows.length === 0) {
    return {
      total_sessions: 0,
      total_profit: 0,
      biggest_win: 0,
      biggest_loss: 0,
      win_count: 0,
      loss_count: 0,
      avg_profit: 0,
      avg_win: 0,
      avg_loss: 0,
      last_played: null,
    };
  }
  const total_sessions = rows.reduce((s, r) => s + r.total_sessions, 0);
  const total_profit = rows.reduce((s, r) => s + r.total_profit, 0);
  const biggest_win = Math.max(0, ...rows.map((r) => r.biggest_win));
  const biggest_loss = Math.min(0, ...rows.map((r) => r.biggest_loss));
  const win_count = rows.reduce((s, r) => s + r.win_count, 0);
  const loss_count = rows.reduce((s, r) => s + r.loss_count, 0);
  const lastPlayedStrs = rows.map((r) => r.last_played).filter(Boolean) as string[];
  const last_played =
    lastPlayedStrs.length > 0 ? lastPlayedStrs.sort().reverse()[0]! : null;
  const avg_profit = total_sessions > 0 ? total_profit / total_sessions : 0;
  const avg_win =
    win_count > 0
      ? rows.reduce((s, r) => s + r.avg_win * r.win_count, 0) / win_count
      : 0;
  const avg_loss =
    loss_count > 0
      ? rows.reduce((s, r) => s + r.avg_loss * r.loss_count, 0) / loss_count
      : 0;
  return {
    total_sessions,
    total_profit,
    biggest_win,
    biggest_loss,
    win_count,
    loss_count,
    avg_profit,
    avg_win,
    avg_loss,
    last_played,
  };
}

export interface CumulativePnlPoint {
  date: string;
  cumulativeProfit: number;
}

/**
 * Fetches cumulative PnL over time for a user.
 * Uses get_cumulative_pnl RPC (same session set / filters as get_player_stats).
 * Returns points { date, cumulativeProfit } sorted by date ascending.
 * On error returns empty array.
 */
export async function getCumulativePnl(
  userId: string,
  groupId?: string | null,
  fromDate?: string,
  toDate?: string
): Promise<CumulativePnlPoint[]> {
  const { data, error } = await supabase.rpc('get_cumulative_pnl', {
    p_user_id: userId,
    p_group_id: groupId ?? null,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? null,
  });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    session_date: string;
    cumulative_profit: number | string;
  }>;
  return rows.map((r) => ({
    date: r.session_date,
    cumulativeProfit: Number(r.cumulative_profit),
  }));
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
    avg_win: number | string;
    avg_loss: number | string;
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
    avg_win: Number(r.avg_win),
    avg_loss: Number(r.avg_loss),
    last_played: r.last_played ?? null,
  }));
}

/**
 * Distinct session dates for a group (any member played), optional date range.
 * Reads game_sessions via RLS (group members can select). Used for streak banner.
 * On error returns empty array.
 */
export async function getGroupSessionDates(
  groupId: string,
  fromDate?: string,
  toDate?: string
): Promise<string[]> {
  let query = supabase
    .from('game_sessions')
    .select('session_date')
    .eq('group_id', groupId);
  if (fromDate) query = query.gte('session_date', fromDate);
  if (toDate) query = query.lte('session_date', toDate);
  const { data, error } = await query;
  if (error) return [];
  const rows = (data ?? []) as Array<{ session_date: string }>;
  return [...new Set(rows.map((r) => r.session_date).filter(Boolean))].sort();
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
    avg_profit?: number;
    max_session_profit?: number;
  }>;
  return rows.map((r) => {
    const total_profit = Number(r.total_profit);
    const total_sessions = Number(r.total_sessions);
    const avg_profitRaw = Number(r.avg_profit ?? 0);
    const max_session_profitRaw = Number(r.max_session_profit ?? 0);
    // When migration (avg_profit/max_session_profit) is not applied, RPC returns only 6 columns → we get 0.
    // Derive avg_profit from totals so "PnL per session" shows; max_session_profit requires the migration.
    const avg_profit =
      avg_profitRaw !== 0
        ? avg_profitRaw
        : total_sessions > 0
          ? total_profit / total_sessions
          : 0;
    // Only derive when exactly one session (then largest = total); else requires migration.
    const max_session_profit =
      max_session_profitRaw !== 0
        ? max_session_profitRaw
        : total_sessions === 1 && total_profit > 0
          ? total_profit
          : 0;
    return {
      user_id: r.user_id,
      display_name: r.display_name ?? '',
      total_profit,
      total_sessions,
      win_count: Number(r.win_count),
      loss_count: Number(r.loss_count),
      avg_profit,
      max_session_profit,
    };
  });
}
