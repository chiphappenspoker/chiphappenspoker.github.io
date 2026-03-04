-- Fix infinite recursion between groups and group_members RLS policies.
-- Use a SECURITY DEFINER function so groups SELECT policy does not query group_members (which would re-enter groups).

-- Function: returns group IDs the user may see (created by user or user is member).
-- Runs with definer rights so RLS is not applied during the union (breaks cycle).
create or replace function public.groups_visible_to(uid uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.groups where created_by = uid
  union
  select group_id from public.group_members where user_id = uid;
$$;

-- Drop the policy that caused recursion (groups selected via group_members).
drop policy if exists "groups_select_member" on public.groups;

-- Replace with a single policy that uses the function (no direct read of group_members from groups RLS).
create policy "groups_select_visible" on public.groups
  for select using (id in (select public.groups_visible_to(auth.uid())));

-- group_members: keep "user sees own memberships" (no recursion). For "creator sees members"
-- we must avoid querying groups from group_members policy. Use a SECURITY DEFINER helper.
create or replace function public.is_group_creator(gid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.groups where id = gid and created_by = uid);
$$;

drop policy if exists "group_members_select" on public.group_members;

create policy "group_members_select" on public.group_members
  for select using (
    auth.uid() = user_id
    or public.is_group_creator(group_id, auth.uid())
  );
