# Phase 3 — Social Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Phase 3 (Social) from the Migration Plan: schema extensions (invite_code, role, player_stats), RLS so group members can read group sessions, invite-by-code and `/join/[code]`, History page with filters, SessionDetail, PnL chart, Leaderboard and Stats pages, and GroupDetail recent games/leaderboard.

**Architecture:** Schema and RLS first so data is correct; then repository API for "sessions visible to user" (creator + group member); then History + SessionDetail; then SQL/view for player_stats and leaderboard; then UI for PnL, Leaderboard, Stats; finally GroupDetail enhancements. Invite link stays backward-compatible: support both `?group=id` and `/join/[invite_code]`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres, RLS, optional Edge Functions), Tailwind CSS. Charts: add Recharts (or Chart.js) for PnL.

**Reference:** `doc/Migration_Plan.md` Phase 3 (Steps 3.1–3.5). Gap analysis: `groups.invite_code` and `group_members.role` missing; no `player_stats`; no RLS for group members on `game_sessions`; no HistoryPage, PnLChart, SessionDetail, LeaderboardPage, StatsPage; invite currently by group UUID only.

---

## Task 1: Add `invite_code` and `role` to schema

**Files:**
- Create: `supabase/migrations/20260308110000_phase3_invite_code_and_role.sql`
- Modify: `src/lib/types.ts` (DbGroup, DbGroupMember)

**Step 1: Create migration for invite_code and role**

Add migration file with:

```sql
-- groups: add invite_code (short shareable code), unique
alter table public.groups
  add column if not exists invite_code text;
create unique index if not exists groups_invite_code_key on public.groups (invite_code) where invite_code is not null;
-- Backfill: generate invite_code for existing groups (e.g. first 8 chars of id or nanoid-style)
-- Optional: use a trigger to set invite_code on insert if null (e.g. encode(gen_random_bytes(4), 'base64') -> replace /+= with safe chars, take 8)
create or replace function public.set_group_invite_code()
returns trigger language plpgsql as $$
begin
  if new.invite_code is null or new.invite_code = '' then
    new.invite_code := lower(substring(md5(gen_random_uuid()::text) from 1 for 8));
  end if;
  return new;
end;
$$;
drop trigger if exists set_group_invite_code on public.groups;
create trigger set_group_invite_code before insert or update on public.groups
  for each row execute function public.set_group_invite_code();
-- Backfill existing rows
update public.groups set invite_code = lower(substring(md5(id::text) from 1 for 8)) where invite_code is null or invite_code = '';
alter table public.groups alter column invite_code set not null;
-- group_members: add role
alter table public.group_members
  add column if not exists role text default 'member' check (role in ('admin', 'member'));
-- Creator is implied admin; optionally set created_by's membership to 'admin' via trigger or app logic
```

(Adjust backfill/trigger as needed; ensure unique invite_code after backfill.)

**Step 2: Run migration**

Run: `npm run supabase:db:push` (or `supabase db push`).

Expected: Migration applies. No errors.

**Step 3: Update TypeScript types**

In `src/lib/types.ts`:
- `DbGroup`: add `invite_code: string;`
- `DbGroupMember`: add `role: 'admin' | 'member';` (and ensure `created_at`/`updated_at` if present in DB)

**Step 4: Commit**

```bash
git add supabase/migrations/20260308110000_phase3_invite_code_and_role.sql src/lib/types.ts
git commit -m "feat(phase3): add invite_code to groups, role to group_members"
```

---

## Task 2: RLS — group members can read group's game_sessions

**Files:**
- Create: `supabase/migrations/20260308110001_rls_game_sessions_group_members.sql`
- Modify: none (RLS only)

**Step 1: Add RLS policy**

Create migration:

```sql
-- Group members can SELECT game_sessions for groups they belong to
create policy "game_sessions_select_group_member" on public.game_sessions
  for select using (
    group_id is not null
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = game_sessions.group_id and gm.user_id = auth.uid()
    )
  );
```

**Step 2: Run migration**

Run: `npm run supabase:db:push`.

Expected: Policy created. Queries for `game_sessions` where user is group member return those rows.

**Step 3: Commit**

```bash
git add supabase/migrations/20260308110001_rls_game_sessions_group_members.sql
git commit -m "feat(phase3): RLS allow group members to read group game_sessions"
```

---

## Task 3: Invite by code — backend and /join/[code] route

**Files:**
- Create: `src/app/(main)/join/[code]/page.tsx`
- Modify: `src/lib/data/repository.ts` (optional: getGroupByInviteCode)
- Modify: `src/lib/data/cloud-repository.ts` (getGroupByInviteCode, ensure createGroup returns invite_code)
- Modify: `src/components/settings/GroupsPanel.tsx` (invite link: use invite_code when available, fallback to group id)

**Step 1: Add getGroupByInviteCode to repository and cloud implementation**

In `src/lib/data/repository.ts` add:
`getGroupByInviteCode(inviteCode: string): Promise<DbGroup | null>;`

In `src/lib/data/cloud-repository.ts` implement: select from `groups` where `invite_code = inviteCode` (single row). Return null if not found. Local repository: return null.

In `src/lib/data/sync-repository.ts` delegate to `cloudRepository.getGroupByInviteCode`.

**Step 2: Ensure createGroup returns invite_code**

After insert in cloud-repository createGroup, select the row back (or ensure Supabase returns it). If DB trigger sets invite_code, the inserted row should have it; verify and add to `CreateGroupParams` / return type if needed.

**Step 3: Create /join/[code] page**

Create `src/app/(main)/join/[code]/page.tsx`: read `params.code`, call `getGroupByInviteCode(code)`. If not found, show "Invalid invitation". If found, redirect to existing invite flow with group id: e.g. `redirect(/invite?group=${group.id}&name=...)` or render same content as `invite/page.tsx` (invite by group id) so user can join. Reuse invite page logic (useSearchParams group/name) by redirecting to `/invite?group=...&name=...`.

**Step 4: Update GroupsPanel invite link**

In `src/components/settings/GroupsPanel.tsx`, invitation link section: if `editingGroup.invite_code` exists, use `${getSiteOrigin()}${BASE_PATH}/join/${editingGroup.invite_code}` (and optionally append `?name=...` for display); else keep current ` /invite?group=${editingGroupId}&name=...`.

**Step 5: Build and verify**

Run: `npm run build`.

Expected: Build succeeds. Manual: create group, copy join link, open in incognito, sign in, join.

**Step 6: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/cloud-repository.ts src/lib/data/local-repository.ts src/lib/data/sync-repository.ts src/app/\(main\)/join/\[code\]/page.tsx src/components/settings/GroupsPanel.tsx
git commit -m "feat(phase3): invite by code and /join/[code] route"
```

---

## Task 4: Repository — getGameSessionsForUser (history visible to user)

**Files:**
- Modify: `src/lib/data/repository.ts`
- Modify: `src/lib/data/cloud-repository.ts`
- Modify: `src/lib/data/sync-repository.ts`
- Modify: `src/lib/data/local-repository.ts`

**Step 1: Extend repository interface**

In `repository.ts` add optional filter params and method:

`getGameSessionsForUser(filters?: { groupId?: string; fromDate?: string; toDate?: string }): Promise<DbGameSession[]>;`

Semantics: returns sessions where user is creator OR (group_id is set and user is group member). Optional filters: by groupId, date range (session_date).

**Step 2: Implement in cloud-repository**

In `cloud-repository.ts`: get current user id. Query `game_sessions` with or: `created_by = userId` OR (group_id in (user's group ids) via group_members). Use Supabase `.or()` and a subquery or two queries merged and deduped. Apply filters: `.eq('group_id', filters.groupId)` if present, `.gte('session_date', filters.fromDate)` / `.lte('session_date', filters.toDate)` if present. Order by created_at desc.

**Step 3: Implement in local-repository**

In `local-repository.ts`: `getGameSessions()` already returns local sessions; for "for user" we don't have multi-user locally. Implement as: return `getGameSessions()` (no filters or apply in-memory filter by group_id and session_date if provided).

**Step 4: Implement in sync-repository**

When logged in, history should show both local and cloud. Option A: call cloud `getGameSessionsForUser` and merge with local by id, dedupe, sort. Option B: only cloud for "history" page (simplest). Choose Option B for now: `getGameSessionsForUser` in sync-repository calls `cloudRepository.getGameSessionsForUser` when logged in, else `localRepository.getGameSessions()` with in-memory filters if any.

**Step 5: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/cloud-repository.ts src/lib/data/local-repository.ts src/lib/data/sync-repository.ts
git commit -m "feat(phase3): getGameSessionsForUser with optional filters"
```

---

## Task 5: History page — list sessions with filters

**Files:**
- Create: `src/app/(main)/history/page.tsx`
- Modify: `src/components/layout/NavMenu.tsx` (add History link)
- Optional: Create hook `src/hooks/useGameHistory.ts` (fetch sessions, filters state)

**Step 1: Create useGameHistory hook (optional but recommended)**

Hook: `getRepository(user), getGameSessionsForUser(filters)`, state for sessions, loading, error; state for filters (groupId, fromDate, toDate). Return { sessions, loading, error, filters, setFilters, reload }.

**Step 2: Create History page**

Create `src/app/(main)/history/page.tsx`: use auth, useGroups (for group filter dropdown), useGameHistory (or inline getRepository + getGameSessionsForUser). UI: filter bar (group select, date from/to), list of sessions (session_date, group name or "No group", currency, link to session detail). Each row links to `/history/[sessionId]` (Task 6). Show "Sign in to see history" when not logged in.

**Step 3: Add History to NavMenu**

In `src/components/layout/NavMenu.tsx`, add `<Link href="/history">History</Link>` (or similar label).

**Step 4: Build and verify**

Run: `npm run build`. Manual: open /history, sign in, see list; filter by group and date.

**Step 5: Commit**

```bash
git add src/hooks/useGameHistory.ts src/app/\(main\)/history/page.tsx src/components/layout/NavMenu.tsx
git commit -m "feat(phase3): History page with group and date filters"
```

---

## Task 6: Session detail page

**Files:**
- Create: `src/app/(main)/history/[sessionId]/page.tsx`
- Modify: repository (optional: getGameSession(sessionId) if not already get-by-id from list)

**Step 1: Add getGameSession(sessionId) if needed**

If we only have getGameSessions (list), add `getGameSession(sessionId: string): Promise<DbGameSession | null>` to repository and cloud (select by id; RLS will allow if creator or group member). Local: find in getGameSessions result or from Dexie. Sync: cloud when logged in, else local.

**Step 2: Create Session detail page**

Create `src/app/(main)/history/[sessionId]/page.tsx`: load session by id, load players for session. If not found or no access, show 404 or "Session not found". Display: session date, group, currency, default buy-in, settlement mode; table of players (name, buy-in, cash-out, net result, settled). Match SettlementPanel-style display (no edit). Link back to /history.

**Step 3: Build and verify**

Run: `npm run build`. Manual: open a session from history, see correct players and amounts.

**Step 4: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/cloud-repository.ts src/lib/data/local-repository.ts src/lib/data/sync-repository.ts src/app/\(main\)/history/\[sessionId\]/page.tsx
git commit -m "feat(phase3): Session detail page"
```

---

## Task 7: player_stats — SQL view or function

**Files:**
- Create: `supabase/migrations/20260308110002_player_stats_view.sql`
- Modify: `src/lib/types.ts` (PlayerStats type)

**Step 1: Define PlayerStats type**

In `src/lib/types.ts` add:

```ts
export interface PlayerStats {
  user_id: string;
  group_id: string | null;
  total_sessions: number;
  total_profit: number;
  biggest_win: number;
  biggest_loss: number;
  win_count: number;
  loss_count: number;
  avg_profit: number;
  last_played: string | null; // date
}
```

**Step 2: Create view or function**

Create migration. Option A: materialized view refreshed on schedule or on demand. Option B: SQL function that returns set of player_stats for a user (and optional group_id) and optional date range. Example function:

```sql
create or replace function public.get_player_stats(
  p_user_id uuid,
  p_group_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  user_id uuid,
  group_id uuid,
  total_sessions bigint,
  total_profit numeric,
  biggest_win numeric,
  biggest_loss numeric,
  win_count bigint,
  loss_count bigint,
  avg_profit numeric,
  last_played date
)
language sql stable
as $$
  select
    gp.user_id,
    gs.group_id,
    count(distinct gs.id)::bigint as total_sessions,
    coalesce(sum(gp.net_result), 0)::numeric as total_profit,
    coalesce(max(case when gp.net_result > 0 then gp.net_result end), 0)::numeric as biggest_win,
    coalesce(min(case when gp.net_result < 0 then gp.net_result end), 0)::numeric as biggest_loss,
    count(*) filter (where gp.net_result > 0)::bigint as win_count,
    count(*) filter (where gp.net_result < 0)::bigint as loss_count,
    coalesce(avg(gp.net_result), 0)::numeric as avg_profit,
    max(gs.session_date)::date as last_played
  from game_players gp
  join game_sessions gs on gs.id = gp.session_id
  where gp.user_id = p_user_id
    and (p_group_id is null or gs.group_id = p_group_id)
    and (p_from_date is null or gs.session_date >= p_from_date)
    and (p_to_date is null or gs.session_date <= p_to_date)
  group by gp.user_id, gs.group_id;
$$;
```

(RPC from client: `supabase.rpc('get_player_stats', { p_user_id, p_group_id, p_from_date, p_to_date })`.)

**Step 3: Run migration**

Run: `npm run supabase:db:push`.

**Step 4: Commit**

```bash
git add supabase/migrations/20260308110002_player_stats_view.sql src/lib/types.ts
git commit -m "feat(phase3): player_stats SQL function and type"
```

---

## Task 8: Leaderboard API and LeaderboardPage

**Files:**
- Create: `src/app/(main)/leaderboard/page.tsx`
- Modify: `src/lib/data/cloud-repository.ts` (or new `src/lib/data/stats.ts`) — getGroupLeaderboard(groupId, fromDate?, toDate?)

**Step 1: Leaderboard data**

Add Supabase RPC or direct query: for a group, return list of users (group members) with total_profit, session count, win rate (win_count / sessions). Can use get_player_stats per member or a single function that returns leaderboard rows for a group. Example: `get_group_leaderboard(p_group_id uuid, p_from_date date, p_to_date date)` returning (user_id, display_name, total_profit, total_sessions, win_count, loss_count).

**Step 2: Expose in repository or stats module**

Add `getGroupLeaderboard(groupId: string, fromDate?: string, toDate?: string): Promise<LeaderboardRow[]>` (LeaderboardRow: user_id, display_name, total_profit, total_sessions, win_count, loss_count). Implement via Supabase RPC.

**Step 3: Create Leaderboard page**

Create `src/app/(main)/leaderboard/page.tsx`: require sign-in. Group selector (user's groups). Time period: all time, last 30 days, last 90 days, this year. Table: rank, name, total profit, sessions, wins, losses, win rate %. Use same styling as rest of app.

**Step 4: Add NavMenu link**

Add `<Link href="/leaderboard">Leaderboard</Link>` in `NavMenu.tsx`.

**Step 5: Build and verify**

Run: `npm run build`. Manual: select group and period, see rankings.

**Step 6: Commit**

```bash
git add src/lib/data/... src/lib/types.ts src/app/\(main\)/leaderboard/page.tsx src/components/layout/NavMenu.tsx
git commit -m "feat(phase3): Leaderboard page and API"
```

---

## Task 9: Stats page (personal statistics)

**Files:**
- Create: `src/app/(main)/stats/page.tsx`
- Modify: repository or stats module — getPlayerStats(userId, groupId?, fromDate?, toDate?) calling get_player_stats RPC

**Step 1: Client call to get_player_stats**

In cloud-repository or stats module, add `getPlayerStats(userId: string, groupId?: string | null, fromDate?: string, toDate?: string): Promise<PlayerStats[]>` calling `supabase.rpc('get_player_stats', { p_user_id: userId, p_group_id: groupId ?? null, p_from_date: fromDate ?? null, p_to_date: toDate ?? null })`. Map result to PlayerStats[].

**Step 2: Create Stats page**

Create `src/app/(main)/stats/page.tsx`: require sign-in. Time period selector. Optional group filter (or "All" for overall). Display: total sessions, total profit, biggest win, biggest loss, win count, loss count, avg profit, last played. Cards or simple list.

**Step 3: Add NavMenu link**

Add `<Link href="/stats">Stats</Link>` in `NavMenu.tsx`.

**Step 4: Build and verify**

Run: `npm run build`. Manual: view personal stats for period and group.

**Step 5: Commit**

```bash
git add src/lib/data/... src/app/\(main\)/stats/page.tsx src/components/layout/NavMenu.tsx
git commit -m "feat(phase3): Stats page and getPlayerStats"
```

---

## Task 10: PnL chart (cumulative profit over time)

**Files:**
- Create: `src/components/history/PnLChart.tsx`
- Modify: `src/app/(main)/stats/page.tsx` or `src/app/(main)/history/page.tsx` (embed chart where it fits; plan says "line chart of cumulative profit over time" — best on Stats or History)
- Modify: `package.json` (add recharts)

**Step 1: Add Recharts**

Run: `npm install recharts`. Add to package.json.

**Step 2: Compute cumulative PnL from sessions**

From getGameSessionsForUser (or getPlayerStats), build time series: for each session date (or created_at), sum net_result for that user up to that date. Data shape: `{ date: string, cumulativeProfit: number }[]`. Sort by date. (Data: need per-session net for the current user — from game_players where user_id = me, joined with game_sessions for date.)

**Step 3: Create PnLChart component**

Create `src/components/history/PnLChart.tsx`: accepts `data: { date: string; cumulativeProfit: number }[]`, renders Recharts LineChart with X = date, Y = cumulativeProfit. Use app theme (dark, accent color).

**Step 4: Add data fetching for "my" PnL**

Repository or stats: get sessions for user, for each session get players where user_id = current user, compute net_result per session, sort by session_date, then cumulative sum. Expose as getCumulativePnl(userId, groupId?, fromDate?, toDate?) or compute in hook.

**Step 5: Embed chart**

Add PnLChart to Stats page (or History). Pass cumulative PnL data. Show "No data" when empty.

**Step 6: Build and verify**

Run: `npm run build`. Manual: ensure chart renders with historical data.

**Step 7: Commit**

```bash
git add package.json package-lock.json src/components/history/PnLChart.tsx src/app/\(main\)/stats/page.tsx src/lib/data/...
git commit -m "feat(phase3): PnL cumulative profit chart"
```

---

## Task 11: GroupDetail — recent games and leaderboard snippet

**Files:**
- Modify: `src/components/settings/GroupsPanel.tsx` (in edit view for a group: add "Recent games" and "Leaderboard" sections)

**Step 1: Recent games in GroupDetail**

In GroupsPanel, when view === 'edit' and editingGroup, fetch getGameSessionsForUser({ groupId: editingGroupId }) (or getGameSessions filtered by group). Show last 5–10 sessions: date, link to session detail. Place below "Players" section.

**Step 2: Leaderboard snippet in GroupDetail**

Call getGroupLeaderboard(editingGroupId) (no date or "all time"). Show top 5 rows: name, total profit. Link "View full leaderboard" to `/leaderboard?group=editingGroupId` or preselect group on leaderboard page.

**Step 3: Build and verify**

Run: `npm run build`. Manual: open a group, see recent games and top rankings.

**Step 4: Commit**

```bash
git add src/components/settings/GroupsPanel.tsx
git commit -m "feat(phase3): GroupDetail recent games and leaderboard snippet"
```

---

## Task 12: Set creator as admin when creating group

**Files:**
- Modify: `src/lib/data/cloud-repository.ts` (createGroup already inserts creator into group_members; add `role: 'admin'` to that insert)

**Step 1: Ensure creator has role admin**

In `cloud-repository.ts` createGroup, the existing `group_members` insert (group_id, user_id) must include `role: 'admin'`. Add the role field to the insert payload. Backfill existing groups in DB if needed (e.g. `update group_members set role = 'admin' where (group_id, user_id) in (select id, created_by from groups)`).

**Step 2: Commit**

```bash
git add src/lib/data/cloud-repository.ts
# or supabase/migrations/...
git commit -m "feat(phase3): set creator as admin in group_members"
```

---

## Task 13: Phase 3 verification checklist

**Files:** None (verification only).

**Step 1: Run verification**

Go through `doc/Migration_Plan.md` Phase 3.5 verification:

- Create group, copy invite link (with invite_code), open in another browser, sign in, join. Leave and re-join if applicable.
- Settle a game in a group; as another group member, open History, see that session; open Session detail, see correct players/payouts.
- PnL chart: run a few sessions, open Stats, confirm cumulative line.
- Leaderboard: select group and period, confirm rankings match session data.
- History filters: set date range and group, confirm list updates.
- Session detail: open from history, confirm all players and amounts.
- RLS: as user A, create group and session; as user B, join group; as B, open History and see group sessions; as user C (not in group), ensure C cannot see group sessions (e.g. direct session id access returns 404 or empty).

**Step 2: Update Migration_Plan.md**

In `doc/Migration_Plan.md`, check off Phase 3.5 verification items that pass.

**Step 3: Commit**

```bash
git add doc/Migration_Plan.md
git commit -m "docs: mark Phase 3 verification items complete"
```

---

## Execution summary

| Order | Task |
|-------|------|
| 1 | Schema: invite_code, role |
| 2 | RLS game_sessions for group members |
| 3 | Invite by code + /join/[code] |
| 4 | getGameSessionsForUser with filters |
| 5 | History page + filters |
| 6 | Session detail page |
| 7 | player_stats SQL + type |
| 8 | Leaderboard API + page |
| 9 | Stats page + getPlayerStats |
| 10 | PnL chart |
| 11 | GroupDetail recent games + leaderboard |
| 12 | Creator as admin |
| 13 | Verification + doc update |

---

**Plan complete and saved to `docs/plans/2026-03-08-phase-3-social-features.md`.**

Two execution options:

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — Open a new session with executing-plans in the same (or a dedicated worktree) and run the plan task-by-task with checkpoints.

Which approach do you want?
