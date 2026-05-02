-- Group members can read all players for any session tied to their group (not only sessions they created).
-- Mirrors game_sessions_select_group_member so history detail matches full session state for every member.

create policy "game_players_select_group_member" on public.game_players
  for select using (
    exists (
      select 1
      from public.game_sessions gs
      where gs.id = game_players.session_id
        and gs.group_id is not null
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = gs.group_id
            and gm.user_id = auth.uid()
        )
    )
  );
