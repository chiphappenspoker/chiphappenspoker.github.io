-- Add avg_win / avg_loss to personal stats (mean of winning / losing sessions).

drop function if exists public.get_player_stats(uuid, uuid, date, date);

create function public.get_player_stats(
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
  last_played date,
  avg_win numeric,
  avg_loss numeric
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
    max(gs.session_date)::date as last_played,
    coalesce(avg(gp.net_result) filter (where gp.net_result > 0), 0) as avg_win,
    coalesce(avg(gp.net_result) filter (where gp.net_result < 0), 0) as avg_loss
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
