-- Free tier: cap only settled sessions; active (in-progress shared) sessions are exempt

drop policy if exists "game_sessions_insert_creator" on public.game_sessions;

create policy "game_sessions_insert_creator" on public.game_sessions
  for insert with check (
    auth.uid() = created_by
    and (
      public.user_has_pro(auth.uid())
      or (
        select count(*)::int
        from public.game_sessions gs
        where gs.created_by = auth.uid()
          and gs.status = 'settled'
      ) < 10
    )
    and (
      group_id is null
      or public.user_has_pro(auth.uid())
    )
  );

notify pgrst, 'reload schema';
