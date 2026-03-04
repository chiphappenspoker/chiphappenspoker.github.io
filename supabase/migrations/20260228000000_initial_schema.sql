-- ChipHappens Phase 2: profiles, groups, group_members, game_sessions, game_players
-- Run with Supabase CLI or apply in Dashboard SQL editor

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text default '',
  revtag text default '',
  currency text default 'EUR',
  default_buy_in text default '30',
  settlement_mode text default 'greedy',
  is_paid boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Groups (user can have multiple; game_sessions link to one)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text default 'EUR',
  default_buy_in text default '30',
  settlement_mode text default 'greedy',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

-- Group members (members are users; their display_name/revtag = usual suspects for that group)
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- Game sessions (group_id nullable = "No group")
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  session_date date not null default current_date,
  currency text not null default 'EUR',
  default_buy_in text default '30',
  settlement_mode text default 'greedy',
  status text not null default 'active' check (status in ('active', 'settled')),
  share_code text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Game players (per session)
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  player_name text not null,
  buy_in numeric not null default 0,
  cash_out numeric not null default 0,
  net_result numeric not null default 0,
  settled boolean default false,
  created_at timestamptz default now()
);

-- Profiles are created from the client (AuthProvider.ensureProfile) so signup is not blocked by RLS.

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.game_sessions;
create trigger set_updated_at before update on public.game_sessions
  for each row execute function public.set_updated_at();
