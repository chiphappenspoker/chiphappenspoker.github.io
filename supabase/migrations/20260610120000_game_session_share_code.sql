-- Auto-generate share_code on game_sessions (mirrors groups.invite_code pattern)

create unique index if not exists game_sessions_share_code_key
  on public.game_sessions (share_code)
  where share_code is not null and share_code <> '';

create or replace function public.set_game_session_share_code()
returns trigger
language plpgsql
as $$
begin
  if new.share_code is null or trim(new.share_code) = '' then
    new.share_code := lower(substring(md5(gen_random_uuid()::text) from 1 for 8));
  end if;
  return new;
end;
$$;

drop trigger if exists set_game_session_share_code on public.game_sessions;
create trigger set_game_session_share_code
  before insert or update on public.game_sessions
  for each row execute function public.set_game_session_share_code();

update public.game_sessions
set share_code = lower(substring(md5(id::text) from 1 for 8))
where share_code is null or trim(share_code) = '';

notify pgrst, 'reload schema';
