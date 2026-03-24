/* ── Supabase DB Models ── */

export interface DbProfile {
  id: string;
  display_name: string;
  revtag: string;
  currency: string;
  default_buy_in: string;
  settlement_mode: string;
  pro_unlocked_at: string | null;
  pro_unlock_source: string | null;
  notification_prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbGroup {
  id: string;
  name: string;
  invite_code: string;
  currency: string;
  default_buy_in: string;
  settlement_mode: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DbGroupMember {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbGameSession {
  id: string;
  created_by: string;
  group_id: string | null;
  session_date: string;
  currency: string;
  default_buy_in: string;
  settlement_mode: string;
  status: string;
  share_code: string;
  created_at: string;
  updated_at: string;
}

export interface DbGamePlayer {
  id: string;
  session_id: string;
  user_id: string | null;
  player_name: string;
  buy_in: number;
  cash_out: number;
  net_result: number;
  settled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlayerStats {
  user_id: string;
  group_id: string | null;
  total_sessions: number;
  total_profit: number;
  biggest_win: number;
  biggest_loss: number;
  win_count: number;
  loss_count: number;
  avg_profit: number;
  last_played: string | null;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  total_profit: number;
  total_sessions: number;
  win_count: number;
  loss_count: number;
  avg_profit: number;
  max_session_profit: number;
}

/* ── Data Models ── */

export interface PayoutRowData {
  id: string;
  name: string;
  buyIn: string;
  cashOut: string;
  settled: boolean;
  /** Marked paid via swipe-to-right; row is highlighted (e.g. velvet green) */
  paid?: boolean;
  /** Set after first save; used for update (upsert) on subsequent saves */
  dbPlayerId?: string;
}

export interface SidePotPlayerData {
  id: string;
  name: string;
  bet: string;
}

export interface CalculatedPot {
  name: string;
  size: number;
  players: string[];
}

export interface Transaction {
  from: string;
  to: string;
  amount: number;
}

/* ── Settings Models ── */

export interface Profile {
  name: string;
  revtag: string;
}

export interface UsualSuspect {
  name: string;
  revtag: string;
}

export interface GameSettings {
  currency: string;
  defaultBuyIn: string;
  settlementMode: 'banker' | 'greedy';
}

export interface SettingsData {
  profile: Profile;
  usualSuspects: UsualSuspect[];
  gameSettings: GameSettings;
}

/* ── Share Data Models ── */

export interface PayoutShareRow {
  name: string;
  in: string;
  out: string;
  settled: boolean;
}

export interface PayoutShareData {
  rows: PayoutShareRow[];
  buyIn: string;
}

export interface SidePotShareRow {
  name: string;
  bet: string;
}

export interface SidePotShareData {
  rows: SidePotShareRow[];
  boards: string;
  initialPot: string;
}

/* ── Payment Link ── */

export interface PaymentLink {
  label: string;
  amount: number;
  link: string;
}
