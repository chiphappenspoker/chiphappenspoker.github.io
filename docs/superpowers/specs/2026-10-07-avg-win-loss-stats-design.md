# Average Win / Average Loss Stats — Design Spec

**Date:** 2026-10-07  
**Status:** Approved — implemented on `feat/win-loss-size`  
**Branch:** `feat/win-loss-size`  
**Approach:** Extend `get_player_stats` RPC with `avg_win` / `avg_loss`

## Problem

The Stats page shows win/loss counts, biggest win/loss, and average profit across all sessions, but not the typical size of a win or a loss. Players want to see how large wins and losses are on average.

## Goal

Add **Average win** and **Average loss** to the personal Stats page (`/stats`), using the same win/loss definitions as existing counts, without an extra network round-trip.

## Requirements (from brainstorming)

| Decision | Choice |
|---|---|
| Definition | Mean of winning sessions only / losing sessions only; breakeven (`net_result = 0`) excluded — same as `win_count` / `loss_count` |
| Placement | Personal Stats page only |
| Average loss display | Signed negative (same as Biggest loss), via existing `fmt()` |
| Empty (no wins or no losses) | Show `0` |
| Approach | Extend `get_player_stats` |

## Current behavior (reference)

`get_player_stats` returns per-(user, group) aggregates including `win_count`, `loss_count`, `biggest_win`, `biggest_loss`, `avg_profit`. Stats page combines rows with `combineStats` and renders a grid. Leaderboard uses a different RPC and is out of scope.

Key files:
- `supabase/migrations/*` — `get_player_stats` definition
- `src/lib/types.ts` — `PlayerStats`
- `src/lib/data/stats.ts` — `getPlayerStats` mapping
- `src/app/(main)/stats/page.tsx` — `combineStats` + UI grid

## Proposed architecture

### 1. RPC: extend `get_player_stats`

Replace the function to add two return columns (keep all existing columns and guards):

```text
avg_win  numeric  -- coalesce(avg(gp.net_result) filter (where gp.net_result > 0), 0)
avg_loss numeric  -- coalesce(avg(gp.net_result) filter (where gp.net_result < 0), 0)
```

Guards unchanged: `p_user_id = auth.uid()`, `user_has_pro`, group/date filters, `security invoker`.

Migration: Postgres cannot add columns to a `RETURNS TABLE` function via `CREATE OR REPLACE` alone — `DROP FUNCTION` the existing `(uuid, uuid, date, date)` overload, then `CREATE FUNCTION` with the expanded return type, then `GRANT EXECUTE` to `authenticated`.

### 2. Client types and mapping

Add to `PlayerStats`:

- `avg_win: number`
- `avg_loss: number`

`getPlayerStats` maps `Number(r.avg_win)` / `Number(r.avg_loss)` like other numeric fields.

### 3. `combineStats` (Group = All)

Cannot arithmetic-mean the per-group averages. Use weighted means:

- `avg_win = sum(avg_win_i * win_count_i) / sum(win_count_i)` when `sum(win_count) > 0`, else `0`
- `avg_loss = sum(avg_loss_i * loss_count_i) / sum(loss_count_i)` when `sum(loss_count) > 0`, else `0`

(Equivalent to global mean of wins/losses across groups.)

### 4. UI

On `/stats` stats grid:

- **Average win** — immediately after Biggest win  
- **Average loss** — immediately after Biggest loss  

Format with existing `fmt()`. No layout redesign.

## Data flow

```
Stats filters (group, period)
  → getPlayerStats → get_player_stats (now includes avg_win, avg_loss)
  → combineStats (weighted avg_win / avg_loss)
  → stats grid rows
```

## Error handling

| Case | Behavior |
|---|---|
| RPC error | Existing: empty rows / “No sessions…” path |
| No winning sessions | `avg_win = 0` |
| No losing sessions | `avg_loss = 0` |
| Single group filter | Use RPC values directly (combine of one row) |

## Testing

- Map `avg_win` / `avg_loss` in `getPlayerStats` (extend `stats` tests or page-level helpers as appropriate).
- Unit-test `combineStats` weighted logic: two groups with different win averages; zero win_count → `0`.
- Manual: known sessions under a filter; Average win/loss match hand calculation; Average loss shows as negative.

## Out of scope

- Leaderboard columns or sort keys  
- Cumulative PnL chart  
- New entitlements / Pro gating beyond existing Stats gate  
- Magnitude-only (unsigned) average loss display  

## Implementation sketch

1. Migration: replace `get_player_stats` with `avg_win` / `avg_loss`.  
2. Update `PlayerStats`, `getPlayerStats`, `combineStats`, Stats grid.  
3. Tests for mapping + weighted combine.  
4. Manual check on `/stats`.
