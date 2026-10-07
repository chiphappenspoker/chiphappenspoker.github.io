# Average Win / Average Loss Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Average win and Average loss on the personal Stats page, computed like existing win/loss counts, via extended `get_player_stats`.

**Architecture:** Drop and recreate `get_player_stats` with `avg_win` / `avg_loss` columns. Map them on `PlayerStats`. Extract `combineStats` into `src/lib/data/stats.ts` so weighted multi-group averages are unit-tested. Add two rows on `/stats` after Biggest win / Biggest loss.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres RPC), Vitest

**Spec:** `docs/superpowers/specs/2026-10-07-avg-win-loss-stats-design.md`

## Global Constraints

- Win/loss definition: `net_result > 0` / `net_result < 0`; breakeven excluded (same as `win_count` / `loss_count`).
- Placement: personal Stats page (`/stats`) only — not Leaderboard.
- Average loss: signed negative, formatted with existing `fmt()`.
- Empty (no wins / no losses): show `0`.
- Extend `get_player_stats` (no extra Stats round-trip).
- Multi-group combine: weighted means via `win_count` / `loss_count`.
- Migration must `DROP FUNCTION` then `CREATE` (cannot add `RETURNS TABLE` columns with `CREATE OR REPLACE` alone).
- No chart, entitlement, or layout redesign beyond two new rows.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20261007130000_get_player_stats_avg_win_loss.sql` | Create | Drop/recreate `get_player_stats` with `avg_win` / `avg_loss` |
| `src/lib/types.ts` | Modify | Add `avg_win` / `avg_loss` to `PlayerStats` |
| `src/lib/data/stats.ts` | Modify | Map new fields; export `combinePlayerStats` (moved from page) |
| `src/lib/data/stats.test.ts` | Modify | Tests for mapping + weighted combine |
| `src/app/(main)/stats/page.tsx` | Modify | Use exported combiner; render Average win / Average loss |

---

### Task 1: Extract `combinePlayerStats` + weighted avg tests (TDD)

**Files:**
- Modify: `src/lib/data/stats.ts`
- Modify: `src/lib/data/stats.test.ts`
- Modify: `src/app/(main)/stats/page.tsx` (import combiner; remove local function)
- Modify: `src/lib/types.ts` (add `avg_win` / `avg_loss` so `PlayerStats` compiles)

**Interfaces:**
- Consumes: `PlayerStats` with `avg_win`, `avg_loss`, `win_count`, `loss_count`, …
- Produces: `combinePlayerStats(rows: PlayerStats[]): CombinedPlayerStats` including `avg_win` / `avg_loss`

- [ ] **Step 1: Add `avg_win` / `avg_loss` to `PlayerStats`**

In `src/lib/types.ts`, update the interface to:

```typescript
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
  avg_win: number;
  avg_loss: number;
  last_played: string | null;
}
```

- [ ] **Step 2: Write failing tests for `combinePlayerStats`**

Append to `src/lib/data/stats.test.ts` (import `combinePlayerStats` from `./stats`):

```typescript
import { getGroupLeaderboard, getCumulativePnl, combinePlayerStats } from './stats';
import type { PlayerStats } from '../types';

function baseRow(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    user_id: 'u1',
    group_id: 'g1',
    total_sessions: 0,
    total_profit: 0,
    biggest_win: 0,
    biggest_loss: 0,
    win_count: 0,
    loss_count: 0,
    avg_profit: 0,
    avg_win: 0,
    avg_loss: 0,
    last_played: null,
    ...overrides,
  };
}

describe('combinePlayerStats', () => {
  it('returns zeros for empty rows', () => {
    expect(combinePlayerStats([])).toEqual({
      total_sessions: 0,
      total_profit: 0,
      biggest_win: 0,
      biggest_loss: 0,
      win_count: 0,
      loss_count: 0,
      avg_profit: 0,
      avg_win: 0,
      avg_loss: 0,
      last_played: null,
    });
  });

  it('computes weighted avg_win and avg_loss across groups', () => {
    const combined = combinePlayerStats([
      baseRow({
        group_id: 'g1',
        total_sessions: 3,
        total_profit: 30,
        win_count: 2,
        loss_count: 1,
        avg_win: 20,
        avg_loss: -10,
        biggest_win: 25,
        biggest_loss: -10,
        last_played: '2026-02-01',
      }),
      baseRow({
        group_id: 'g2',
        total_sessions: 2,
        total_profit: 10,
        win_count: 1,
        loss_count: 1,
        avg_win: 40,
        avg_loss: -30,
        biggest_win: 40,
        biggest_loss: -30,
        last_played: '2026-03-01',
      }),
    ]);
    // avg_win = (20*2 + 40*1) / (2+1) = 80/3
    expect(combined.avg_win).toBeCloseTo(80 / 3);
    // avg_loss = (-10*1 + -30*1) / (1+1) = -20
    expect(combined.avg_loss).toBe(-20);
    expect(combined.win_count).toBe(3);
    expect(combined.loss_count).toBe(2);
    expect(combined.total_sessions).toBe(5);
    expect(combined.total_profit).toBe(40);
    expect(combined.biggest_win).toBe(40);
    expect(combined.biggest_loss).toBe(-30);
    expect(combined.avg_profit).toBe(8);
    expect(combined.last_played).toBe('2026-03-01');
  });

  it('returns 0 avg_win / avg_loss when counts are zero', () => {
    const combined = combinePlayerStats([
      baseRow({ total_sessions: 1, total_profit: 0, avg_win: 99, avg_loss: -99 }),
    ]);
    expect(combined.avg_win).toBe(0);
    expect(combined.avg_loss).toBe(0);
  });
});
```

Also update any existing `getPlayerStats` mock fixtures later in Task 2; for now if TypeScript fails elsewhere because `PlayerStats` gained fields, add `avg_win: 0, avg_loss: 0` only where the compiler requires it for this task’s tests to run.

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:run -- src/lib/data/stats.test.ts
```

Expected: FAIL — `combinePlayerStats` is not exported / not defined.

- [ ] **Step 4: Implement `combinePlayerStats` in `stats.ts`**

Add and export (near the top of `src/lib/data/stats.ts` after imports, or after the cumulative PnL helpers):

```typescript
export type CombinedPlayerStats = {
  total_sessions: number;
  total_profit: number;
  biggest_win: number;
  biggest_loss: number;
  win_count: number;
  loss_count: number;
  avg_profit: number;
  avg_win: number;
  avg_loss: number;
  last_played: string | null;
};

/** Combine multiple PlayerStats rows (e.g. one per group) into one view. */
export function combinePlayerStats(rows: PlayerStats[]): CombinedPlayerStats {
  if (rows.length === 0) {
    return {
      total_sessions: 0,
      total_profit: 0,
      biggest_win: 0,
      biggest_loss: 0,
      win_count: 0,
      loss_count: 0,
      avg_profit: 0,
      avg_win: 0,
      avg_loss: 0,
      last_played: null,
    };
  }
  const total_sessions = rows.reduce((s, r) => s + r.total_sessions, 0);
  const total_profit = rows.reduce((s, r) => s + r.total_profit, 0);
  const biggest_win = Math.max(0, ...rows.map((r) => r.biggest_win));
  const biggest_loss = Math.min(0, ...rows.map((r) => r.biggest_loss));
  const win_count = rows.reduce((s, r) => s + r.win_count, 0);
  const loss_count = rows.reduce((s, r) => s + r.loss_count, 0);
  const lastPlayedStrs = rows.map((r) => r.last_played).filter(Boolean) as string[];
  const last_played =
    lastPlayedStrs.length > 0 ? lastPlayedStrs.sort().reverse()[0]! : null;
  const avg_profit = total_sessions > 0 ? total_profit / total_sessions : 0;
  const avg_win =
    win_count > 0
      ? rows.reduce((s, r) => s + r.avg_win * r.win_count, 0) / win_count
      : 0;
  const avg_loss =
    loss_count > 0
      ? rows.reduce((s, r) => s + r.avg_loss * r.loss_count, 0) / loss_count
      : 0;
  return {
    total_sessions,
    total_profit,
    biggest_win,
    biggest_loss,
    win_count,
    loss_count,
    avg_profit,
    avg_win,
    avg_loss,
    last_played,
  };
}
```

Ensure `PlayerStats` is already imported from `../types` in `stats.ts`.

- [ ] **Step 5: Wire Stats page to `combinePlayerStats`**

In `src/app/(main)/stats/page.tsx`:

- Import: `import { getPlayerStats, getCumulativePnl, combinePlayerStats } from '@/lib/data/stats';`
- Delete the local `combineStats` function entirely.
- Replace `combineStats(rows)` with `combinePlayerStats(rows)`.

Temporarily map missing RPC fields in `getPlayerStats` so the page still typechecks before Task 2:

```typescript
avg_win: Number((r as { avg_win?: number | string }).avg_win ?? 0),
avg_loss: Number((r as { avg_loss?: number | string }).avg_loss ?? 0),
```

(Prefer completing Task 2 mapping in the same sitting if the compiler already forces it — Task 2 makes this permanent.)

Do **not** add the Average win/loss UI rows yet (Task 4).

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/data/stats.test.ts
```

Expected: PASS (existing + new `combinePlayerStats` tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/data/stats.ts src/lib/data/stats.test.ts src/app/(main)/stats/page.tsx
git commit -m "$(cat <<'EOF'
feat(stats): add combinePlayerStats with weighted avg win/loss

EOF
)"
```

---

### Task 2: Map `avg_win` / `avg_loss` in `getPlayerStats` (TDD)

**Files:**
- Modify: `src/lib/data/stats.ts`
- Modify: `src/lib/data/stats.test.ts`

**Interfaces:**
- Consumes: RPC rows with `avg_win`, `avg_loss`
- Produces: `PlayerStats[]` with numeric `avg_win` / `avg_loss`; `[]` on error (unchanged)

- [ ] **Step 1: Write failing mapping tests**

Append to `src/lib/data/stats.test.ts`:

```typescript
describe('getPlayerStats', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('maps avg_win and avg_loss from get_player_stats', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          group_id: 'g1',
          total_sessions: 4,
          total_profit: 50,
          biggest_win: 30,
          biggest_loss: -20,
          win_count: 2,
          loss_count: 2,
          avg_profit: 12.5,
          avg_win: '25',
          avg_loss: -15,
          last_played: '2026-04-01',
        },
      ],
      error: null,
    });
    const { getPlayerStats } = await import('./stats');
    // Prefer static import at top: import { getPlayerStats } from './stats';
    const rows = await getPlayerStats('u1', 'g1');
    expect(mockRpc).toHaveBeenCalledWith('get_player_stats', {
      p_user_id: 'u1',
      p_group_id: 'g1',
      p_from_date: null,
      p_to_date: null,
    });
    expect(rows[0]).toMatchObject({
      avg_win: 25,
      avg_loss: -15,
      biggest_win: 30,
      biggest_loss: -20,
    });
  });

  it('returns empty array on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const rows = await getPlayerStats('u1');
    expect(rows).toEqual([]);
  });
});
```

Use a **static** import for `getPlayerStats` at the top of the file (same pattern as `getCumulativePnl`), not dynamic import — the dynamic import comment above is a reminder only; do not leave `await import` in the committed test.

- [ ] **Step 2: Run tests to verify mapping assertions fail if fields missing**

```bash
npm run test:run -- src/lib/data/stats.test.ts
```

Expected: FAIL on `avg_win` / `avg_loss` if mapping not yet complete; if Task 1 already added temporary mapping, expect PASS and skip to commit after hardening types in Step 3.

- [ ] **Step 3: Complete `getPlayerStats` mapping**

In `src/lib/data/stats.ts` inside `getPlayerStats`, extend the row type and map:

```typescript
  const rows = (data ?? []) as Array<{
    user_id: string;
    group_id: string | null;
    total_sessions: number | string;
    total_profit: number | string;
    biggest_win: number | string;
    biggest_loss: number | string;
    win_count: number | string;
    loss_count: number | string;
    avg_profit: number | string;
    avg_win: number | string;
    avg_loss: number | string;
    last_played: string | null;
  }>;
  return rows.map((r) => ({
    user_id: r.user_id,
    group_id: r.group_id ?? null,
    total_sessions: Number(r.total_sessions),
    total_profit: Number(r.total_profit),
    biggest_win: Number(r.biggest_win),
    biggest_loss: Number(r.biggest_loss),
    win_count: Number(r.win_count),
    loss_count: Number(r.loss_count),
    avg_profit: Number(r.avg_profit),
    avg_win: Number(r.avg_win),
    avg_loss: Number(r.avg_loss),
    last_played: r.last_played ?? null,
  }));
```

Remove any temporary `(r as { avg_win?: ... })` casts from Task 1.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:run -- src/lib/data/stats.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/stats.ts src/lib/data/stats.test.ts
git commit -m "$(cat <<'EOF'
feat(stats): map avg_win and avg_loss from get_player_stats

EOF
)"
```

---

### Task 3: Migration — extend `get_player_stats`

**Files:**
- Create: `supabase/migrations/20261007130000_get_player_stats_avg_win_loss.sql`

**Interfaces:**
- Consumes: existing `game_players` / `game_sessions`, `user_has_pro`
- Produces: `get_player_stats(uuid, uuid, date, date)` returning prior columns plus `avg_win`, `avg_loss`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20261007130000_get_player_stats_avg_win_loss.sql` with exactly:

```sql
-- Add avg_win / avg_loss to personal stats (mean of winning / losing sessions).

drop function if exists public.get_player_stats(uuid, uuid, date, date);

create function public.get_player_stats(
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
  last_played date,
  avg_win numeric,
  avg_loss numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gp.user_id,
    gs.group_id,
    count(distinct gs.id)::bigint as total_sessions,
    coalesce(sum(gp.net_result), 0) as total_profit,
    coalesce(max(case when gp.net_result > 0 then gp.net_result end), 0) as biggest_win,
    coalesce(min(case when gp.net_result < 0 then gp.net_result end), 0) as biggest_loss,
    count(*) filter (where gp.net_result > 0) as win_count,
    count(*) filter (where gp.net_result < 0) as loss_count,
    coalesce(avg(gp.net_result), 0) as avg_profit,
    max(gs.session_date)::date as last_played,
    coalesce(avg(gp.net_result) filter (where gp.net_result > 0), 0) as avg_win,
    coalesce(avg(gp.net_result) filter (where gp.net_result < 0), 0) as avg_loss
  from public.game_players gp
  join public.game_sessions gs on gs.id = gp.session_id
  where gp.user_id = p_user_id
    and p_user_id = auth.uid()
    and public.user_has_pro(auth.uid())
    and (p_group_id is null or gs.group_id = p_group_id)
    and (p_from_date is null or gs.session_date >= p_from_date)
    and (p_to_date is null or gs.session_date <= p_to_date)
  group by gp.user_id, gs.group_id;
$$;

grant execute on function public.get_player_stats(uuid, uuid, date, date) to authenticated;
```

Note: new columns are appended after `last_played` so the SELECT list order matches `RETURNS TABLE` column order.

- [ ] **Step 2: Push migration**

```bash
npm run supabase:db:push
```

Expected: migration applied. If push cannot run, still commit the file and note deploy requires push.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261007130000_get_player_stats_avg_win_loss.sql
git commit -m "$(cat <<'EOF'
feat(db): add avg_win and avg_loss to get_player_stats

EOF
)"
```

---

### Task 4: Stats page UI rows

**Files:**
- Modify: `src/app/(main)/stats/page.tsx`

**Interfaces:**
- Consumes: `combinePlayerStats` → `avg_win`, `avg_loss`
- Produces: two new labeled rows in the stats grid

- [ ] **Step 1: Add UI rows**

In the stats grid in `src/app/(main)/stats/page.tsx`, immediately after the Biggest win block, insert:

```tsx
                <div className="flex justify-between settings-field">
                  <span className="muted-text">Average win</span>
                  <span>{fmt(combined.avg_win)}</span>
                </div>
```

Immediately after the Biggest loss block, insert:

```tsx
                <div className="flex justify-between settings-field">
                  <span className="muted-text">Average loss</span>
                  <span>{fmt(combined.avg_loss)}</span>
                </div>
```

Final order in that section: Sessions, Total profit, Biggest win, **Average win**, Biggest loss, **Average loss**, Wins / Losses, Avg profit per session, Last played.

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(main)/stats/page.tsx'
git commit -m "$(cat <<'EOF'
feat(stats): show Average win and Average loss on stats page

EOF
)"
```

---

### Task 5: Spec status + manual checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-avg-win-loss-stats-design.md`

- [ ] **Step 1: Update status line**

Change to:

```markdown
**Status:** Approved — implemented on `feat/win-loss-size`
```

- [ ] **Step 2: Manual verification** (human or agent with Pro session)

With migration applied and `npm run dev`:

1. Pro user, `/stats`, sessions with both wins and losses.
2. Average win ≈ mean of positive `net_result`s for the filter; Average loss is negative.
3. Group = All: values match weighted combine across groups.
4. Filter with only wins (or only losses): the empty side shows `0`.
5. Leaderboard unchanged.

If interactive Pro login is unavailable, document remaining checklist items honestly in the commit message body or a short note in the report — do not invent pass results.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-07-avg-win-loss-stats-design.md
git commit -m "$(cat <<'EOF'
docs: mark avg win/loss stats spec implemented

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Extend `get_player_stats` with avg_win / avg_loss | Task 3 |
| DROP then CREATE migration | Task 3 |
| PlayerStats + client mapping | Tasks 1–2 |
| Weighted combineStats | Task 1 |
| UI after Biggest win/loss, signed fmt, 0 when empty | Task 4 (+ SQL coalesce) |
| Stats only; no leaderboard/chart/entitlements | File map / out of scope |
| Tests mapping + weighted combine | Tasks 1–2 |
| Manual verification | Task 5 |

No placeholders. Types consistent: `avg_win` / `avg_loss` on `PlayerStats`, `CombinedPlayerStats`, RPC, and UI.
