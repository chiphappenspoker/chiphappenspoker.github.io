-- Single active client (soft): bump on each new sign-in; other devices detect via profiles.session_generation
alter table public.profiles
  add column if not exists session_generation bigint not null default 0;

comment on column public.profiles.session_generation is
  'Incremented on each SIGNED_IN; clients compare with local storage to sign out stale sessions.';

create or replace function public.bump_session_generation()
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, display_name, revtag, session_generation, updated_at)
  values (auth.uid(), '', '', 1, now())
  on conflict (id) do update set
    session_generation = public.profiles.session_generation + 1,
    updated_at = now()
  returning session_generation into v;

  return v;
end;
$$;

grant execute on function public.bump_session_generation() to authenticated;

notify pgrst, 'reload schema';
