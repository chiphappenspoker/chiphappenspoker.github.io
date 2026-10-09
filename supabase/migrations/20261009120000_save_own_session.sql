-- Atomic creator-path save: session + players in one transaction (avoids orphan empty sessions).

create or replace function public.save_own_session(
  p_session_id uuid,
  p_group_id uuid,
  p_session_date date,
  p_currency text,
  p_default_buy_in text,
  p_settlement_mode text,
  p_status text,
  p_players jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := nullif(trim(p_status), '');
  v_player jsonb;
  v_player_id uuid;
  v_kept_ids uuid[] := '{}';
  v_exists boolean;
  v_share_code text;
begin
  if v_uid is null or p_session_id is null then
    raise exception 'unauthorized';
  end if;

  if v_status is null or v_status not in ('active', 'settled') then
    raise exception 'invalid_status';
  end if;

  select exists(
    select 1 from public.game_sessions gs where gs.id = p_session_id
  ) into v_exists;

  if v_exists then
    if not exists (
      select 1 from public.game_sessions gs
      where gs.id = p_session_id and gs.created_by = v_uid
    ) then
      raise exception 'forbidden';
    end if;

    if p_group_id is not null and not public.user_has_pro(v_uid) then
      raise exception 'pro_required_for_group';
    end if;

    update public.game_sessions
    set
      group_id = p_group_id,
      session_date = coalesce(p_session_date, session_date),
      currency = coalesce(p_currency, currency),
      default_buy_in = coalesce(p_default_buy_in, default_buy_in),
      settlement_mode = coalesce(p_settlement_mode, settlement_mode),
      status = v_status,
      updated_at = now()
    where id = p_session_id;
  else
    if not public.can_insert_game_session(v_uid) then
      raise exception 'session_limit';
    end if;
    if p_group_id is not null and not public.user_has_pro(v_uid) then
      raise exception 'pro_required_for_group';
    end if;

    insert into public.game_sessions (
      id, created_by, group_id, session_date, currency, default_buy_in, settlement_mode, status
    ) values (
      p_session_id,
      v_uid,
      p_group_id,
      coalesce(p_session_date, current_date),
      coalesce(p_currency, 'EUR'),
      coalesce(p_default_buy_in, '30'),
      coalesce(p_settlement_mode, 'greedy'),
      v_status
    );
  end if;

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
      p_session_id,
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
      session_id = excluded.session_id,
      user_id = excluded.user_id,
      player_name = excluded.player_name,
      buy_in = excluded.buy_in,
      cash_out = excluded.cash_out,
      net_result = excluded.net_result,
      settled = excluded.settled,
      updated_at = now();
  end loop;

  delete from public.game_players gp
  where gp.session_id = p_session_id
    and not (gp.id = any (v_kept_ids));

  select gs.share_code into v_share_code
  from public.game_sessions gs
  where gs.id = p_session_id;

  return json_build_object(
    'session_id', p_session_id,
    'share_code', coalesce(v_share_code, '')
  );
end;
$$;

grant execute on function public.save_own_session(uuid, uuid, date, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
