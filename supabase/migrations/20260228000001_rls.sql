-- Row-Level Security for ChipHappens Phase 2

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;

-- profiles: users can read/update only their own row; insert own row (for signup trigger or client-side create)
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- groups: creator can CRUD; members can SELECT (to use group for sessions and see members)
create policy "groups_select_creator" on public.groups
  for select using (auth.uid() = created_by);
create policy "groups_select_member" on public.groups
  for select using (
    exists (select 1 from public.group_members where group_id = groups.id and user_id = auth.uid())
  );
create policy "groups_insert_creator" on public.groups
  for insert with check (auth.uid() = created_by);
create policy "groups_update_creator" on public.groups
  for update using (auth.uid() = created_by);
create policy "groups_delete_creator" on public.groups
  for delete using (auth.uid() = created_by);

-- group_members: creator can add/remove; users can manage own membership; members can SELECT
create policy "group_members_select" on public.group_members
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
  );
create policy "group_members_insert_creator" on public.group_members
  for insert with check (
    exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
  );
create policy "group_members_insert_self" on public.group_members
  for insert with check (auth.uid() = user_id);
create policy "group_members_delete_creator" on public.group_members
  for delete using (
    exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
  );
create policy "group_members_delete_self" on public.group_members
  for delete using (auth.uid() = user_id);

-- game_sessions: creator can CRUD
create policy "game_sessions_all_creator" on public.game_sessions
  for all using (auth.uid() = created_by);

-- game_players: session creator can CRUD; linked user can read own
create policy "game_players_all_creator" on public.game_players
  for all using (
    exists (select 1 from public.game_sessions s where s.id = game_players.session_id and s.created_by = auth.uid())
  );
create policy "game_players_select_linked" on public.game_players
  for select using (auth.uid() = user_id);
