-- Add created_at/updated_at where missing so every table has both

-- groups: add updated_at
alter table public.groups
  add column if not exists updated_at timestamptz default now();
update public.groups set updated_at = created_at where updated_at is null;
alter table public.groups alter column updated_at set default now();

drop trigger if exists set_updated_at on public.groups;
create trigger set_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

-- group_members: add created_at (joined_at remains; created_at for consistency) and updated_at
alter table public.group_members
  add column if not exists created_at timestamptz default now();
alter table public.group_members
  add column if not exists updated_at timestamptz default now();
update public.group_members set created_at = joined_at, updated_at = joined_at where created_at is null;
alter table public.group_members alter column created_at set default now();
alter table public.group_members alter column updated_at set default now();

drop trigger if exists set_updated_at on public.group_members;
create trigger set_updated_at before update on public.group_members
  for each row execute function public.set_updated_at();

-- game_players: add updated_at
alter table public.game_players
  add column if not exists updated_at timestamptz default now();
update public.game_players set updated_at = created_at where updated_at is null;
alter table public.game_players alter column updated_at set default now();

drop trigger if exists set_updated_at on public.game_players;
create trigger set_updated_at before update on public.game_players
  for each row execute function public.set_updated_at();
