# Supabase setup (ChipHappens Phase 2)

## Prerequisites

- Supabase CLI is installed as a dev dependency (`npm install`).
- A Supabase project (create one at [supabase.com](https://supabase.com) if needed).

## Link to your remote project (one-time)

The hosted project ref for ChipHappens is **`buhmynyqymryrjnqdiqt`** (from `https://buhmynyqymryrjnqdiqt.supabase.co`).

1. Add to **`.env.local`** (see `.env.example`):
   - `SUPABASE_DB_PASSWORD` — Dashboard → **Project Settings → Database** (database password).
   - `SUPABASE_ACCESS_TOKEN` — Dashboard (avatar) → **Account → Access Tokens** → create a token (used by the CLI to talk to the Management API).

2. From the project root:

```bash
npm run supabase:link
```

This runs `npx supabase link --project-ref buhmynyqymryrjnqdiqt` (or `SUPABASE_PROJECT_REF` if set) with your DB password. The access token is picked up from the environment via `.env.local`.

Alternatively, run `npx supabase login` once (paste the same token), then:

```bash
npx supabase link --project-ref buhmynyqymryrjnqdiqt --password "$SUPABASE_DB_PASSWORD" --yes
```

## Apply migrations (database from scratch)

Push all migrations to the linked remote database:

```bash
npm run supabase:db:push
```

Or (accept prompt non-interactively):

```bash
echo "Y" | npx supabase db push
```

If the CLI says "Remote migration versions not found in local migrations directory", the remote has different migration history. Repair and push:

```bash
npx supabase migration repair --status reverted <remote_version_1> <remote_version_2> ...
npm run supabase:db:push
```

This runs, in order:

1. **20260228000000_initial_schema.sql** – tables: `profiles`, `groups`, `group_members`, `game_sessions`, `game_players`; `updated_at` triggers (no auth trigger; profiles are created from the client).
2. **20260228000001_rls.sql** – enables RLS and creates all policies (including `profiles_insert_own` for client-side profile creation).
3. **20260228100000_fix_rls_recursion.sql** – SECURITY DEFINER helpers for groups/group_members.
4. **20260301000000_add_updated_at_columns.sql** – `updated_at` columns.
5. **20260301000001_profiles_select_group_members.sql** – allows reading profiles of users who share a group (required so group creators see all members in the UI; without it, only your own profile is visible and invited members appear missing on PWA/production).

## Reset remote database (optional)

To wipe the remote DB and re-apply all migrations:

```bash
npm run supabase:db:reset
```

**Warning:** This deletes all data in the linked project’s database.

## Local development (optional)

To run Supabase locally:

```bash
npx supabase start
```

Then link to the local project and push migrations as above, or use the local DB URL in your app.

## Email templates (signup confirmation, etc.)

The default Supabase signup confirmation email does not mention ChipHappens. To use a branded subject and body:

- **Local / self-hosted:** Already configured in `config.toml` and `supabase/templates/confirmation.html`. Restart after changing: `supabase stop && supabase start`.
- **Hosted Supabase (Dashboard):** Go to [Authentication → Email Templates](https://supabase.com/dashboard/project/_/auth/templates). Under **Confirm signup**, set:
  - **Subject:** e.g. `Confirm your ChipHappens signup`
  - **Body:** Copy the HTML from `supabase/templates/confirmation.html` (keep the variables `{{ .ConfirmationURL }}`, etc.). Save.

Other templates (invite, recovery, magic link, etc.) can be customized the same way in `config.toml` and Dashboard.

## Troubleshooting: group members visible locally but not on PWA

If the group creator sees invited members on the local/dev site but not in the deployed PWA (and the user exists in `group_members` and `profiles` in Supabase):

1. **Apply all migrations on the hosted project** the PWA uses. The policy that lets you read other members’ profiles is in **20260301000001_profiles_select_group_members.sql**. Without it, RLS only allows reading your own profile, so the member list shows only you. From the project root: `npm run supabase:db:push` (with the project linked to the same Supabase project as the PWA).
2. **Reload the PWA** after applying migrations (pull-to-refresh or close and reopen the app) so the member list is refetched.
