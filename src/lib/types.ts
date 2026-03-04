/* ── Supabase DB Models ── */

export interface DbProfile {
  id: string;
  display_name: string;
  revtag: string;
  currency: string;
  default_buy_in: string;
  settlement_mode: string;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbGroup {
  id: string;
  name: string;
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
/* ── Data Models ── */

export interface PayoutRowData {
  id: string;
  name: string;
  buyIn: string;
  cashOut: string;
  settled: boolean;
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
