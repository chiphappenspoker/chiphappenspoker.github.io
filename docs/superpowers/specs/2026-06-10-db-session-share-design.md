# Database Session Share — Design Spec

**Date:** 2026-06-10  
**Status:** Approved (brainstorming)  
**Approach:** A — Share-code link with upload-on-share and immediate edit

## Problem

The payout **Share** button encodes the current table into the URL (`?s=…`). That is a static snapshot: it does not sync with the database, cannot be updated collaboratively, and is unavailable for in-progress games because sessions are only uploaded on **End session** (`status: 'settled'`).

The goal is **banker handoff**: when the banker leaves early, they share a link so another logged-in player can open the live session from the database and continue editing.

## Goal

Replace URL-embedded table sharing with a **database-backed share link** using the existing `game_sessions.share_code` column. Share triggers an **auto-upload** of the in-progress session (`status: 'active'`). Recipients open the link, load session + players from the DB, and edit immediately.

## Requirements

| Decision | Choice |
|---|---|
| Share mechanism | `share_code` on `game_sessions` (8-char random, like group `invite_code`) |
| Link format | `/?code=<share_code>` on the payout calculator page |
| Upload on share | Upsert session as `status: 'active'` + players before copying link |
| Recipient access | Must be logged in; load via RPC; can edit immediately |
| End session | Same row transitions `active` → `settled` (existing end-session flow) |
| Free-tier 10 cap | Count only `status = 'settled'` sessions; `active` sessions exempt |
| History | Exclude `active` sessions from history list |
| History page copy | No new text about shared games |
| Legacy `?s=` links | Keep decode as read-only fallback |
| Auto-save while in progress | Out of scope for v1 (share + manual edits only) |
| Concurrent edits | Last-write-wins for v1 |

## Current State (reference)

| Piece | Today |
|---|---|
| Share | `encodePayoutShareData` → `?s=` URL in `usePayoutCalculator.getShareUrl` |
| DB upload | `handleSaveSession` in `PayoutTable.tsx`, only on end session, `status: 'settled'` |
| `share_code` | Column exists, always saved as `''` |
| RLS | Creator-only write; group members read |
| Free cap | `< 10` total sessions owned by user |

Key files:
- `src/hooks/usePayoutCalculator.ts` — share encode/decode, localStorage, init
- `src/components/payout/PayoutTable.tsx` — `handleSaveSession`, `handleShare`
- `src/lib/data/cloud-repository.ts`, `sync-repository.ts` — persistence
- `supabase/migrations/20260324120000_phase3b_entitlements.sql` — insert cap RLS

## Proposed Flow

### Banker shares

```
Share
  → saveActiveSession() — upsert session (status: active) + players
  → share_code set by DB trigger on first insert
  → copy link: {origin}{basePath}/?code={share_code}
  → toast success / error
```

### Recipient opens link

```
Open /?code=...
  → [if not logged in] sign-in prompt, then return
  → get_session_by_share_code RPC (active sessions only)
  → load rows, buy-in, group, currentSessionId, dbPlayerIds into calculator
  → sessionInProgress = true
  → store shareCode in payout localStorage for subsequent saves
  → can edit immediately
```

### Recipient (or any holder of share code) saves

```
Save / further edits
  → if shareCode in state: upsert_shared_session RPC
  → else if creator: existing repo.saveGameSession / saveGamePlayer path
```

### End session

```
End session (unchanged confirm + upload flow)
  → finalizeSession() — same session id, status: settled
  → share link stops working for edit (RPC requires active)
```

## Backend

### 1. `share_code` auto-generation

Mirror `set_group_invite_code` trigger on `game_sessions`:
- Before insert/update: if `share_code` null/empty, set 8-char lowercase hex from `md5(gen_random_uuid())`
- Unique partial index on non-empty `share_code`

### 2. RLS: settled-only insert cap

Change `game_sessions_insert_creator` count from all sessions to:

```sql
(select count(*)::int from public.game_sessions gs
 where gs.created_by = auth.uid() and gs.status = 'settled') < 10
```

Promoting `active` → `settled` via UPDATE is always allowed (not a new insert).

### 3. RPC `get_session_by_share_code(p_share_code text)`

- `SECURITY DEFINER`, `authenticated` only
- Returns JSON: `{ session, players }` or null
- Only matches `status = 'active'`
- Requires `auth.uid() is not null`

### 4. RPC `upsert_shared_session(...)`

- `SECURITY DEFINER`, `authenticated` only
- Validates `share_code` matches an `active` session
- Updates session fields: `default_buy_in`, `currency`, `settlement_mode`, `updated_at`
- Upserts players from JSON payload; deletes players not in payload
- Does not change `created_by` or `share_code`
- Requires `auth.uid() is not null`

### 5. History filtering

`getGameSessionsForUser` (cloud, local, sync) excludes `status = 'active'` so history never lists in-progress shared sessions.

## Frontend

### Save split

| Function | When | `status` |
|---|---|---|
| `saveActiveSession()` | Share button | `active` |
| `finalizeSession()` | End session | `settled` |

Both reuse the same player-mapping logic from today's `handleSaveSession`.

### `getShareUrl`

1. Call `saveActiveSession()`
2. Read `share_code` from saved session (return from save or refetch)
3. Return `{origin}{basePath}/?code={share_code}`

Remove `?s=` encoding from share path. Keep `decodePayoutShareData` for legacy links on init.

### Init (`usePayoutCalculator`)

Priority: `?code=` → `?s=` / `?share=` → localStorage → defaults.

On `?code=`: fetch via repository, populate table, set `sharedSessionCode`, clear `?code` from URL (optional, like other flows).

### Auth gate

If `?code=` present and user not logged in, show sign-in (reuse existing `SignInModal` pattern). After sign-in, load session.

### Repository additions

```typescript
getSessionByShareCode(code: string): Promise<{ session: DbGameSession; players: DbGamePlayer[] } | null>
upsertSharedSession(code: string, payload: SharedSessionPayload): Promise<string | null> // session id
```

Cloud: Supabase RPC. Sync: cloud RPC + local mirror. Local: return null / no-op.

## Error Handling

| Case | Behavior |
|---|---|
| Upload fails on share | Toast error; no link copied |
| Invalid/expired code | Toast "Invalid or ended session link" |
| Session settled | RPC returns null; show ended message |
| Offline share | Sync queue handles creator upload; copy link only after local+enqueue succeeds |
| Two editors | Last-write-wins (v1) |

## Out of Scope

- Auto-save debounce while session in progress
- Optimistic locking / conflict UI
- Side pot calculator share (payout only)
- Stale `active` session cleanup job
- Ownership transfer (Approach B)

## Testing

- Unit: repository RPC wrappers, history filter excludes active
- Component: share uploads then copies `?code=` URL; open code loads table
- Migration: manual `supabase db push` + RPC smoke test
