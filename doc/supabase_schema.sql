# Supabase SQL Schema

-- profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id),
  display_name text,
  revtag text,
  currency text default 'EUR',
  default_buy_in text default '30',
  settlement_mode text default 'greedy',
  pro_unlocked_at timestamptz,
  pro_unlock_source text,
  notification_prefs jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- groups
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- group_members
create table if not exists group_members (
  group_id uuid references groups(id),
  user_id uuid references profiles(id),
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- game_sessions
create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id),
  group_id uuid references groups(id),
  session_date date,
  currency text,
  default_buy_in text,
  settlement_mode text,
  status text,
  share_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- game_players
create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references game_sessions(id),
  user_id uuid references profiles(id),
  player_name text,
  buy_in numeric,
  cash_out numeric,
  net_result numeric,
  settled boolean default false,
  created_at timestamptz default now()
);
