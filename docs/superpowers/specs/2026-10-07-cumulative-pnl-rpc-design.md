# Cumulative Profit Chart Performance — Design Spec

**Date:** 2026-10-07  
**Status:** Draft (awaiting user review)  
**Branch:** `perf/cumulative-pnl-rpc`  
**Approach:** Supabase RPC (one round-trip), matching `get_player_stats`

## Problem

The Stats page “Cumulative profit over time” chart becomes slow as session count grows. The pain is **fetch latency** (“Loading chart…”), not chart rendering.

Root cause: `getCumulativePnl` in `src/lib/data/stats.ts` loads sessions, then issues **one `game_players` query per session** (N+1). Summary stats already use a single RPC (`get_player_stats`) and feel responsive.

## Goal

Make the chart load **roughly as fast as the summary stats** — one server round-trip feel — while keeping existing filters (group, time period) and chart UI.

## Requirements (from brainstorming)

| Decision | Choice |
|---|---|
| Primary pain | Fetch latency (not render jank) |
| Success bar | Chart as fast as summary stats (one round-trip feel) |
| Implementation preference | Either RPC or client batch OK; pick simplest reliable |
| Chosen approach | New Supabase RPC |

## Current behavior (reference)

```
Stats page
  → getPlayerStats → supabase.rpc('get_player_stats')     // fast
  → getCumulativePnl
       → query game_sessions (created_by)
       → query group_members + game_sessions (member groups)
       → filter group/date client-side
       → for each session: query game_players net_result   // N+1
       → accumulate client-side
  → PnLChart (Recharts)
```

Key files:
- `src/lib/data/stats.ts` — `getCumulativePnl`, `getPlayerStats`
- `src/app/(main)/stats/page.tsx` — loads chart data
- `src/components/history/PnLChart.tsx` — render only (unchanged)
- `supabase/migrations/*_player_stats*` / entitlements — RPC + Pro gate pattern

## Proposed architecture

### 1. New RPC: `get_cumulative_pnl`

Signature mirrors `get_player_stats`:

```text
get_cumulative_pnl(
  p_user_id uuid,
  p_group_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
) returns table (
  session_date date,
  cumulative_profit numeric
)
```

Guards (same as `get_player_stats`):
- `p_user_id = auth.uid()`
- `public.user_has_pro(auth.uid())`
- `security invoker`, `stable`, `search_path = public`
- `grant execute … to authenticated`

Core logic:
1. Join `game_players` → `game_sessions` for this user.
2. Apply optional `group_id` / date filters.
3. Aggregate to one profit per session (`sum(gp.net_result)`), ordered by `session_date`, then `session_id` for stable ties.
4. Compute running total with a window: `sum(session_profit) over (order by session_date, session_id)`.
5. Return `(session_date, cumulative_profit)` ascending.

### 2. Data semantics (intentional alignment)

**Use the same session set as summary stats:** rows in `game_players` for this user, not the current client’s broader “created_by OR group member sessions” discovery.

Consequence: with the same group/date filters, the **last cumulative point equals combined `total_profit`** from `get_player_stats`. That is a correctness property we want.

Sessions where the user never played (no `game_players` row) are excluded — they contribute nothing to stats today either.

### 3. Client

`getCumulativePnl` becomes a thin RPC wrapper:

- Call `supabase.rpc('get_cumulative_pnl', { p_user_id, p_group_id, p_from_date, p_to_date })`.
- Map to existing `CumulativePnlPoint[]` (`date`, `cumulativeProfit`).
- On error, return `[]` (same as today’s soft failure for chart).

`StatsPage` and `PnLChart` stay unchanged aside from benefiting from faster data.

## Data flow

```
Stats page (filters: group, period)
  → getPlayerStats → get_player_stats RPC
  → getCumulativePnl → get_cumulative_pnl RPC   // single round-trip
  → PnLChart(data)
```

## Error handling

| Case | Behavior |
|---|---|
| RPC error / network | Empty chart data; existing “No data” / loading UX |
| Empty history | Empty array → “No data for this period.” |
| Not Pro / wrong uid | RPC returns no rows / fails under existing guards; chart empty |
| Filter change mid-flight | Existing cancel flag on `useEffect` unchanged |

## Testing

- **Client:** `getCumulativePnl` maps RPC rows to `CumulativePnlPoint`; returns `[]` on error (extend `stats.test.ts` or add focused tests with mocked supabase).
- **Semantics (document + assert where practical):** same filters → last cumulative equals combined stats `total_profit`; date ordering ascending; group and date filters applied.
- **No change required** to `PnLChart` visuals for this work.

## Out of scope

- Recharts dot density / downsampling / virtualization (render was not the reported problem).
- Caching series across filter changes.
- Changing Stats page layout or entitlement gating.

## Implementation sketch

1. Migration: create `get_cumulative_pnl` (+ grant).
2. Rewrite `getCumulativePnl` to call the RPC and map fields.
3. Tests for mapping / error path; verify filter params passed through.
4. Manual check on Stats: chart loads with summary; last point matches total profit.
