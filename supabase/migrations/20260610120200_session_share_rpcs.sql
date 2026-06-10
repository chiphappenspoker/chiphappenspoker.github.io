-- Fetch active session + players by share_code (authenticated users only)

create or replace function public.get_session_by_share_code(p_share_code text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_code text := nullif(trim(p_share_code), '');
  result json;
begin
  if auth.uid() is null or v_code is null then
    return null;
  end if;

  select json_build_object(
    'session', row_to_json(gs.*),
    'players', coalesce((
      select json_agg(row_to_json(gp.*) order by gp.created_at)
      from public.game_players gp
      where gp.session_id = gs.id
    ), '[]'::json)
  )
  into result
  from public.game_sessions gs
  where gs.share_code = v_code
    and gs.status = 'active'
  limit 1;

  return result;
end;
$$;

create or replace function public.upsert_shared_session(
  p_share_code text,
  p_default_buy_in text,
  p_currency text,
  p_settlement_mode text,
  p_players jsonb,
  p_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := nullif(trim(p_share_code), '');
  v_session_id uuid;
  v_player jsonb;
  v_player_id uuid;
  v_kept_ids uuid[] := '{}';
begin
  if auth.uid() is null or v_code is null then
    raise exception 'unauthorized';
  end if;

  select gs.id into v_session_id
  from public.game_sessions gs
  where gs.share_code = v_code
    and gs.status = 'active'
  limit 1;

  if v_session_id is null then
    raise exception 'session_not_found';
  end if;

  update public.game_sessions
  set
    default_buy_in = coalesce(p_default_buy_in, default_buy_in),
    currency = coalesce(p_currency, currency),
    settlement_mode = coalesce(p_settlement_mode, settlement_mode),
    status = coalesce(nullif(trim(p_status), ''), status),
    updated_at = now()
  where id = v_session_id;

  for v_player in select * from jsonb_array_elements(coalesce(p_players, '[]'::jsonb))
  loop
    v_player_id := (v_player->>'id')::uuid;
    if v_player_id is null then
      continue;
    end if;
    v_kept_ids := array_append(v_kept_ids, v_player_id);

    insert into public.game_players (
      id, session_id, user_id, player_name, buy_in, cash_out, net_result, settled, created_at, updated_at
    )
    values (
      v_player_id,
      v_session_id,
      nullif(v_player->>'user_id', '')::uuid,
      coalesce(v_player->>'player_name', ''),
      coalesce((v_player->>'buy_in')::numeric, 0),
      coalesce((v_player->>'cash_out')::numeric, 0),
      coalesce((v_player->>'net_result')::numeric, 0),
      coalesce((v_player->>'settled')::boolean, false),
      coalesce((v_player->>'created_at')::timestamptz, now()),
      now()
    )
    on conflict (id) do update set
      user_id = excluded.user_id,
      player_name = excluded.player_name,
      buy_in = excluded.buy_in,
      cash_out = excluded.cash_out,
      net_result = excluded.net_result,
      settled = excluded.settled,
      updated_at = now();
  end loop;

  delete from public.game_players gp
  where gp.session_id = v_session_id
    and not (gp.id = any (v_kept_ids));

  return v_session_id;
end;
$$;

grant execute on function public.get_session_by_share_code(text) to authenticated;
grant execute on function public.upsert_shared_session(text, text, text, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
