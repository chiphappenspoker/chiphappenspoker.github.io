-- Remove the original get_group_leaderboard(p_group_id, p_from_date, p_to_date) overload
-- so PostgREST has a single candidate and no "could not choose the best candidate" error.
-- The client calls with (p_from_date, p_group_id, p_to_date); only that overload remains.

drop function if exists public.get_group_leaderboard(uuid, date, date);

notify pgrst, 'reload schema';
