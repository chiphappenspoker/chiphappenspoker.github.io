-- Dev: mark specific accounts as Pro (Phase 3b). Safe if rows are missing (no-op).
-- Re-apply anytime by running this migration again or the UPDATE in the SQL editor.

update public.profiles
set
  pro_unlocked_at = now(),
  pro_unlock_source = 'dev',
  updated_at = now()
where id in (
  'c784a853-6800-4f46-b207-f4eeca083a73'::uuid,
  '732e87cd-53b6-4aeb-8533-97aeafb5010f'::uuid
);
