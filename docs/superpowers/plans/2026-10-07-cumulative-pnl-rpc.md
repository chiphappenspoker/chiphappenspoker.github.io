# Cumulative PnL RPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stats “Cumulative profit over time” chart load in one Supabase round-trip by replacing the N+1 `getCumulativePnl` client loop with a `get_cumulative_pnl` RPC.

**Architecture:** Add a SQL RPC mirroring `get_player_stats` (same auth/Pro/filter guards) that returns a running total per session. Rewrite `getCumulativePnl` as a thin RPC wrapper that maps to existing `CumulativePnlPoint`. Leave `StatsPage` and `PnLChart` unchanged.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres RPC + JS client), Vitest

**Spec:** `docs/superpowers/specs/2026-10-07-cumulative-pnl-rpc-design.md`

## Global Constraints

- Chart fetch must feel like summary stats: **one RPC round-trip** (no per-session queries).
- Session set must match `get_player_stats`: only `game_players` rows for the user (not created_by / group-member discovery).
- Same filters → **last cumulative point equals combined stats `total_profit`**.
- On RPC error, return `[]` (soft failure; do not throw).
- Keep `CumulativePnlPoint` shape: `{ date: string; cumulativeProfit: number }`.
- Do not change Recharts / downsampling / Stats layout / entitlement UI.
- Follow existing Pro gate: `p_user_id = auth.uid()` and `public.user_has_pro(auth.uid())`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/data/stats.test.ts` | Modify | Tests for `getCumulativePnl` RPC params, mapping, error → `[]` |
| `src/lib/data/stats.ts` | Modify | Replace N+1 loop with `supabase.rpc('get_cumulative_pnl', …)` |
| `supabase/migrations/20261007120000_get_cumulative_pnl.sql` | Create | `get_cumulative_pnl` function + grant |
| `src/app/(main)/stats/page.tsx` | No change | Already calls `getCumulativePnl` |
| `src/components/history/PnLChart.tsx` | No change | Render only |

---

### Task 1: Failing client tests for `getCumulativePnl`

**Files:**
- Modify: `src/lib/data/stats.test.ts`
- Test: `src/lib/data/stats.test.ts`

**Interfaces:**
- Consumes: existing `vi.mock('../supabase/client')` with `mockRpc`
- Produces: failing tests that expect `getCumulativePnl` to call `get_cumulative_pnl` and map rows

- [ ] **Step 1: Import `getCumulativePnl` and add a describe block**

In `src/lib/data/stats.test.ts`, change the import to:

```typescript
import { getGroupLeaderboard, getCumulativePnl } from './stats';
```

Append this describe block after the existing `getGroupLeaderboard` tests:

```typescript
describe('getCumulativePnl', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls get_cumulative_pnl with user, group, and date params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getCumulativePnl('user-1', 'group-1', '2026-01-01', '2026-03-01');
    expect(mockRpc).toHaveBeenCalledWith('get_cumulative_pnl', {
      p_user_id: 'user-1',
      p_group_id: 'group-1',
      p_from_date: '2026-01-01',
      p_to_date: '2026-03-01',
    });
  });

  it('passes null for missing group and dates', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getCumulativePnl('user-1');
    expect(mockRpc).toHaveBeenCalledWith('get_cumulative_pnl', {
      p_user_id: 'user-1',
      p_group_id: null,
      p_from_date: null,
      p_to_date: null,
    });
  });

  it('maps RPC rows to CumulativePnlPoint and coerces numbers', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { session_date: '2026-01-10', cumulative_profit: '10' },
        { session_date: '2026-01-20', cumulative_profit: 25.5 },
      ],
      error: null,
    });
    const points = await getCumulativePnl('user-1', null);
    expect(points).toEqual([
      { date: '2026-01-10', cumulativeProfit: 10 },
      { date: '2026-01-20', cumulativeProfit: 25.5 },
    ]);
  });

  it('returns empty array on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not pro' } });
    await expect(getCumulativePnl('user-1')).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:run -- src/lib/data/stats.test.ts
```

Expected: FAIL — either `getCumulativePnl` still hits `.from` (mock has no `.from` / unexpected calls) or does not call `get_cumulative_pnl` with those args. Do **not** implement yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/data/stats.test.ts
git commit -m "$(cat <<'EOF'
test: add failing getCumulativePnl RPC contract tests

EOF
)"
```

---

### Task 2: Rewrite `getCumulativePnl` as RPC wrapper

**Files:**
- Modify: `src/lib/data/stats.ts` (replace `getCumulativePnl` body; keep `CumulativePnlPoint` export)
- Test: `src/lib/data/stats.test.ts`

**Interfaces:**
- Consumes: `supabase.rpc`, params `(userId, groupId?, fromDate?, toDate?)`
- Produces: `Promise<CumulativePnlPoint[]>` via `get_cumulative_pnl`

- [ ] **Step 1: Replace `getCumulativePnl` implementation**

In `src/lib/data/stats.ts`, replace the entire `getCumulativePnl` function (keep the interface and JSDoc intent) with:

```typescript
/**
 * Fetches cumulative PnL over time for a user.
 * Uses get_cumulative_pnl RPC (same session set / filters as get_player_stats).
 * Returns points { date, cumulativeProfit } sorted by date ascending.
 * On error returns empty array.
 */
export async function getCumulativePnl(
  userId: string,
  groupId?: string | null,
  fromDate?: string,
  toDate?: string
): Promise<CumulativePnlPoint[]> {
  const { data, error } = await supabase.rpc('get_cumulative_pnl', {
    p_user_id: userId,
    p_group_id: groupId ?? null,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? null,
  });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    session_date: string;
    cumulative_profit: number | string;
  }>;
  return rows.map((r) => ({
    date: r.session_date,
    cumulativeProfit: Number(r.cumulative_profit),
  }));
}
```

Remove all `.from('game_sessions')` / `.from('group_members')` / per-session `.from('game_players')` logic from this function. Do not change `getPlayerStats` or `getGroupLeaderboard`.

- [ ] **Step 2: Run tests to verify they pass**

Run:

```bash
npm run test:run -- src/lib/data/stats.test.ts
```

Expected: PASS (all `getGroupLeaderboard` and `getCumulativePnl` tests).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/stats.ts src/lib/data/stats.test.ts
git commit -m "$(cat <<'EOF'
feat(stats): load cumulative PnL via single RPC call

EOF
)"
```

---

### Task 3: Add `get_cumulative_pnl` migration

**Files:**
- Create: `supabase/migrations/20261007120000_get_cumulative_pnl.sql`

**Interfaces:**
- Consumes: `game_players`, `game_sessions`, `user_has_pro`, `auth.uid()` (same as `get_player_stats`)
- Produces: `public.get_cumulative_pnl(uuid, uuid, date, date) → (session_date date, cumulative_profit numeric)`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20261007120000_get_cumulative_pnl.sql` with exactly:

```sql
-- Cumulative profit over time for Stats chart (one round-trip).
-- Session set matches get_player_stats: game_players rows for the user.

create or replace function public.get_cumulative_pnl(
  p_user_id uuid,
  p_group_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  session_date date,
  cumulative_profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_session as (
    select
      gs.id as session_id,
      gs.session_date::date as session_date,
      coalesce(sum(gp.net_result), 0) as session_profit
    from public.game_players gp
    join public.game_sessions gs on gs.id = gp.session_id
    where gp.user_id = p_user_id
      and p_user_id = auth.uid()
      and public.user_has_pro(auth.uid())
      and (p_group_id is null or gs.group_id = p_group_id)
      and (p_from_date is null or gs.session_date >= p_from_date)
      and (p_to_date is null or gs.session_date <= p_to_date)
    group by gs.id, gs.session_date
  )
  select
    ps.session_date,
    sum(ps.session_profit) over (
      order by ps.session_date, ps.session_id
      rows between unbounded preceding and current row
    ) as cumulative_profit
  from per_session ps
  order by ps.session_date, ps.session_id;
$$;

grant execute on function public.get_cumulative_pnl(uuid, uuid, date, date) to authenticated;
```

- [ ] **Step 2: Push migration to the linked Supabase project**

Run (requires local env / linked project):

```bash
npm run supabase:db:push
```

Expected: migration applied successfully; function `get_cumulative_pnl` exists.

If push cannot run in this environment, still commit the migration file and note that deploy requires `npm run supabase:db:push` before the live Stats chart works against production/staging.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261007120000_get_cumulative_pnl.sql
git commit -m "$(cat <<'EOF'
feat(db): add get_cumulative_pnl RPC for stats chart

EOF
)"
```

---

### Task 4: Spec status + manual verification checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-cumulative-pnl-rpc-design.md` (status line only)

**Interfaces:**
- Consumes: deployed RPC + client from Tasks 2–3
- Produces: confirmed behavior on Stats page

- [ ] **Step 1: Update spec status**

Change the header status from `Draft (awaiting user review)` to:

```markdown
**Status:** Approved — implemented on `perf/cumulative-pnl-rpc`
```

(Only after Tasks 1–3 are done.)

- [ ] **Step 2: Manual verification**

With migration applied and app running (`npm run dev`):

1. Sign in as a Pro user with multiple sessions.
2. Open `/stats` — chart should leave “Loading chart…” roughly when summary stats appear (no long stall).
3. With Group = All and Period = All time, confirm last chart point equals **Total profit**.
4. Change Group and Time period — chart updates; last point still matches Total profit for those filters.
5. Non-Pro / signed-out behavior unchanged (feature gate).

- [ ] **Step 3: Commit status update**

```bash
git add docs/superpowers/specs/2026-10-07-cumulative-pnl-rpc-design.md
git commit -m "$(cat <<'EOF'
docs: mark cumulative PnL RPC spec implemented

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| One-round-trip RPC | Task 3 (SQL) + Task 2 (client) |
| Same guards as `get_player_stats` | Task 3 |
| Session set = `game_players` for user | Task 3 |
| Last point = combined `total_profit` | Task 3 window sum + Task 4 manual check |
| Map to `CumulativePnlPoint` | Task 2 |
| Error → `[]` | Task 1 tests + Task 2 |
| StatsPage / PnLChart unchanged | File map (no tasks) |
| Out of scope: downsampling / cache / layout | Not in plan |

No placeholders remaining. Types consistent: RPC columns `session_date` / `cumulative_profit` → client `date` / `cumulativeProfit`.
