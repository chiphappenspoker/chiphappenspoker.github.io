-- Phase 3b: PRO unlock fields, FREE session cap (10 owned), groups/join require PRO, RPC gates

-- 1. Profile columns
alter table public.profiles
  add column if not exists pro_unlocked_at timestamptz,
  add column if not exists pro_unlock_source text,
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- 2. Migrate legacy paid flag
update public.profiles
set
  pro_unlocked_at = coalesce(pro_unlocked_at, now()),
  pro_unlock_source = coalesce(pro_unlock_source, 'legacy_is_paid')
where coalesce(is_paid, false) = true
  and pro_unlocked_at is null;

-- 3. PRO check (SECURITY INVOKER; uses caller's rights on profiles)
create or replace function public.user_has_pro(uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.pro_unlocked_at is not null
  );
$$;

grant execute on function public.user_has_pro(uuid) to authenticated;

-- 4. game_sessions: split ALL policy into granular policies + FREE insert cap
drop policy if exists "game_sessions_all_creator" on public.game_sessions;

create policy "game_sessions_select_creator" on public.game_sessions
  for select using (auth.uid() = created_by);

create policy "game_sessions_insert_creator" on public.game_sessions
  for insert with check (
    auth.uid() = created_by
    and (
      public.user_has_pro(auth.uid())
      or (select count(*)::int from public.game_sessions gs where gs.created_by = auth.uid()) < 10
    )
    and (
      group_id is null
      or public.user_has_pro(auth.uid())
    )
  );

create policy "game_sessions_update_creator" on public.game_sessions
  for update
  using (auth.uid() = created_by)
  with check (
    auth.uid() = created_by
    and (
      group_id is null
      or public.user_has_pro(auth.uid())
    )
  );

create policy "game_sessions_delete_creator" on public.game_sessions
  for delete using (auth.uid() = created_by);

-- 5. Creating a group requires PRO
drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator" on public.groups
  for insert with check (
    auth.uid() = created_by
    and public.user_has_pro(auth.uid())
  );

-- 6. Joining a group (self insert) requires PRO
drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self" on public.group_members
  for insert with check (
    auth.uid() = user_id
    and public.user_has_pro(auth.uid())
  );

-- 7. Stats RPC: only for self and only if PRO
create or replace function public.get_player_stats(
  p_user_id uuid,
  p_group_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  user_id uuid,
  group_id uuid,
  total_sessions bigint,
  total_profit numeric,
  biggest_win numeric,
  biggest_loss numeric,
  win_count bigint,
  loss_count bigint,
  avg_profit numeric,
  last_played date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gp.user_id,
    gs.group_id,
    count(distinct gs.id)::bigint as total_sessions,
    coalesce(sum(gp.net_result), 0) as total_profit,
    coalesce(max(case when gp.net_result > 0 then gp.net_result end), 0) as biggest_win,
    coalesce(min(case when gp.net_result < 0 then gp.net_result end), 0) as biggest_loss,
    count(*) filter (where gp.net_result > 0) as win_count,
    count(*) filter (where gp.net_result < 0) as loss_count,
    coalesce(avg(gp.net_result), 0) as avg_profit,
    max(gs.session_date)::date as last_played
  from public.game_players gp
  join public.game_sessions gs on gs.id = gp.session_id
  where gp.user_id = p_user_id
    and p_user_id = auth.uid()
    and public.user_has_pro(auth.uid())
    and (p_group_id is null or gs.group_id = p_group_id)
    and (p_from_date is null or gs.session_date >= p_from_date)
    and (p_to_date is null or gs.session_date <= p_to_date)
  group by gp.user_id, gs.group_id;
$$;

grant execute on function public.get_player_stats(uuid, uuid, date, date) to authenticated;

-- 8. Leaderboard RPC: member of group + PRO
drop function if exists public.get_group_leaderboard(date, uuid, date);

create or replace function public.get_group_leaderboard(
  p_from_date date default null,
  p_group_id uuid default null,
  p_to_date date default null
)
returns table (
  user_id uuid,
  display_name text,
  total_profit numeric,
  total_sessions bigint,
  win_count bigint,
  loss_count bigint,
  avg_profit numeric,
  max_session_profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gm.user_id,
    p.display_name,
    coalesce(sum(gp.net_result), 0)::numeric as total_profit,
    count(distinct gs.id)::bigint as total_sessions,
    count(*) filter (where gp.net_result > 0)::bigint as win_count,
    count(*) filter (where gp.net_result < 0)::bigint as loss_count,
    coalesce(avg(gp.net_result), 0)::numeric as avg_profit,
    coalesce(max(gp.net_result), 0)::numeric as max_session_profit
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  left join public.game_players gp on gp.user_id = gm.user_id
  left join public.game_sessions gs on gs.id = gp.session_id
    and gs.group_id = p_group_id
    and (p_from_date is null or gs.session_date >= p_from_date)
    and (p_to_date is null or gs.session_date <= p_to_date)
  where gm.group_id = p_group_id
    and p_group_id is not null
    and public.user_has_pro(auth.uid())
    and exists (
      select 1 from public.group_members gx
      where gx.group_id = p_group_id
        and gx.user_id = auth.uid()
    )
  group by gm.user_id, p.display_name;
$$;

grant execute on function public.get_group_leaderboard(date, uuid, date) to authenticated;

notify pgrst, 'reload schema';
