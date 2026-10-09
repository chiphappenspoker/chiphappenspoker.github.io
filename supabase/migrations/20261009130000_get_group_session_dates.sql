-- Distinct play days for a group (for leaderboard streak banner).
-- Same membership + Pro gate pattern as get_group_leaderboard.

create or replace function public.get_group_session_dates(
  p_from_date date default null,
  p_group_id uuid default null,
  p_to_date date default null
)
returns table (
  session_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct gs.session_date::date as session_date
  from public.game_sessions gs
  where gs.group_id = p_group_id
    and p_group_id is not null
    and public.user_has_pro(auth.uid())
    and (p_from_date is null or gs.session_date >= p_from_date)
    and (p_to_date is null or gs.session_date <= p_to_date)
    and exists (
      select 1 from public.group_members gx
      where gx.group_id = p_group_id
        and gx.user_id = auth.uid()
    )
  order by session_date;
$$;

grant execute on function public.get_group_session_dates(date, uuid, date) to authenticated;

notify pgrst, 'reload schema';
