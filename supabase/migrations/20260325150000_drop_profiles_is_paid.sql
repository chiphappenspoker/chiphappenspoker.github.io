-- Legacy is_paid was migrated to pro_unlocked_at in 20260324120000_phase3b_entitlements.sql.
alter table public.profiles drop column if exists is_paid;

notify pgrst, 'reload schema';
