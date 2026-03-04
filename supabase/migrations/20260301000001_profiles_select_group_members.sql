-- Allow reading profiles of users who share a group with the current user
-- (so getGroupMembersWithIds can resolve display_name/revtag and we can populate game_players.user_id)
create policy "profiles_select_group_members" on public.profiles
  for select using (
    exists (
      select 1 from public.group_members g1
      join public.group_members g2 on g1.group_id = g2.group_id and g2.user_id = auth.uid()
      where g1.user_id = profiles.id
    )
  );
