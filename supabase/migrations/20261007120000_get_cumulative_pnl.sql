-- Cumulative profit over time for Stats chart (one round-trip).
-- Session set matches get_player_stats: game_players rows for the user.

create or replace function public.get_cumulative_pnl(
  p_user_id uuid,
  p_group_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  session_date date,
  cumulative_profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_session as (
    select
      gs.id as session_id,
      gs.session_date::date as session_date,
      coalesce(sum(gp.net_result), 0) as session_profit
    from public.game_players gp
    join public.game_sessions gs on gs.id = gp.session_id
    where gp.user_id = p_user_id
      and p_user_id = auth.uid()
      and public.user_has_pro(auth.uid())
      and (p_group_id is null or gs.group_id = p_group_id)
      and (p_from_date is null or gs.session_date >= p_from_date)
      and (p_to_date is null or gs.session_date <= p_to_date)
    group by gs.id, gs.session_date
  )
  select
    ps.session_date,
    sum(ps.session_profit) over (
      order by ps.session_date, ps.session_id
      rows between unbounded preceding and current row
    ) as cumulative_profit
  from per_session ps
  order by ps.session_date, ps.session_id;
$$;

grant execute on function public.get_cumulative_pnl(uuid, uuid, date, date) to authenticated;
