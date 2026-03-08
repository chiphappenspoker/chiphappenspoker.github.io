-- Add overload get_group_leaderboard(p_from_date, p_group_id, p_to_date) so PostgREST
-- finds the function when the client sends JSON keys in alphabetical order.
-- Uses full implementation so it works whether or not the (p_group_id, p_from_date, p_to_date) overload exists.

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
  loss_count bigint
)
language sql
stable
security invoker
as $$
  select
    gm.user_id,
    p.display_name,
    coalesce(sum(gp.net_result), 0)::numeric as total_profit,
    count(distinct gs.id)::bigint as total_sessions,
    count(*) filter (where gp.net_result > 0)::bigint as win_count,
    count(*) filter (where gp.net_result < 0)::bigint as loss_count
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  left join public.game_players gp on gp.user_id = gm.user_id
  left join public.game_sessions gs on gs.id = gp.session_id
    and gs.group_id = p_group_id
    and (p_from_date is null or gs.session_date >= p_from_date)
    and (p_to_date is null or gs.session_date <= p_to_date)
  where gm.group_id = p_group_id
  group by gm.user_id, p.display_name;
$$;

grant execute on function public.get_group_leaderboard(date, uuid, date) to authenticated;

-- Reload PostgREST schema cache so the new overload is visible (Supabase listens for this).
notify pgrst, 'reload schema';
