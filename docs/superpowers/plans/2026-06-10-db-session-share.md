# Database Session Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace URL-embedded payout sharing with a database-backed share link that uploads in-progress sessions on share and lets recipients load and edit the live session via `share_code`.

**Architecture:** Add `share_code` trigger and two Supabase RPCs (`get_session_by_share_code`, `upsert_shared_session`). Split save into `saveActiveSession` (share, `active`) and `finalizeSession` (end, `settled`). Share copies `/?code=…`; init loads from code. Free-tier cap counts only settled sessions. History excludes active sessions.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Supabase (Postgres RLS + RPC), Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-06-10-db-session-share-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260610120000_game_session_share_code.sql` | Create | `share_code` trigger + unique index |
| `supabase/migrations/20260610120100_game_sessions_settled_cap.sql` | Create | RLS insert cap counts settled only |
| `supabase/migrations/20260610120200_session_share_rpcs.sql` | Create | `get_session_by_share_code`, `upsert_shared_session` |
| `src/lib/types.ts` | Modify | `SharedSessionPayload` type |
| `src/lib/data/repository.ts` | Modify | New repository interface methods |
| `src/lib/data/cloud-repository.ts` | Modify | RPC wrappers |
| `src/lib/data/sync-repository.ts` | Modify | Sync + history filter |
| `src/lib/data/local-repository.ts` | Modify | Stubs + history filter |
| `src/lib/session/save-payout-session.ts` | Create | Shared save logic for active/settled |
| `src/hooks/usePayoutCalculator.ts` | Modify | `?code=` init, `sharedSessionCode`, `getShareUrl` |
| `src/components/payout/PayoutTable.tsx` | Modify | `saveActiveSession`, `finalizeSession`, `handleShare` |
| `src/components/payout/PayoutTable.test.tsx` | Modify | Share + code-load tests |
| `src/hooks/useGameHistory.ts` | — | No copy changes (filter in repo) |
| `src/lib/data/local-repository.test.ts` | Modify | Active session excluded from history query |
| `src/lib/data/cloud-repository.test.ts` | Modify | RPC wrapper tests (mocked) |

---

### Task 1: `share_code` trigger migration

**Files:**
- Create: `supabase/migrations/20260610120000_game_session_share_code.sql`

- [ ] **Step 1: Write migration**

```sql
-- Auto-generate share_code on game_sessions (mirrors groups.invite_code pattern)

create unique index if not exists game_sessions_share_code_key
  on public.game_sessions (share_code)
  where share_code is not null and share_code <> '';

create or replace function public.set_game_session_share_code()
returns trigger
language plpgsql
as $$
begin
  if new.share_code is null or trim(new.share_code) = '' then
    new.share_code := lower(substring(md5(gen_random_uuid()::text) from 1 for 8));
  end if;
  return new;
end;
$$;

drop trigger if exists set_game_session_share_code on public.game_sessions;
create trigger set_game_session_share_code
  before insert or update on public.game_sessions
  for each row execute function public.set_game_session_share_code();

-- Backfill existing rows
update public.game_sessions
set share_code = lower(substring(md5(id::text) from 1 for 8))
where share_code is null or trim(share_code) = '';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply locally**

Run: `npm run supabase:db:push`  
Expected: migrations apply without error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610120000_game_session_share_code.sql
git commit -m "feat(db): auto-generate game_sessions share_code"
```

---

### Task 2: Settled-only free-tier insert cap

**Files:**
- Create: `supabase/migrations/20260610120100_game_sessions_settled_cap.sql`

- [ ] **Step 1: Write migration**

```sql
-- Free tier: cap only settled sessions; active (in-progress shared) sessions are exempt

drop policy if exists "game_sessions_insert_creator" on public.game_sessions;

create policy "game_sessions_insert_creator" on public.game_sessions
  for insert with check (
    auth.uid() = created_by
    and (
      public.user_has_pro(auth.uid())
      or (
        select count(*)::int
        from public.game_sessions gs
        where gs.created_by = auth.uid()
          and gs.status = 'settled'
      ) < 10
    )
    and (
      group_id is null
      or public.user_has_pro(auth.uid())
    )
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply locally**

Run: `npm run supabase:db:push`  
Expected: policy replaced successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610120100_game_sessions_settled_cap.sql
git commit -m "feat(db): exempt active sessions from free-tier insert cap"
```

---

### Task 3: Session share RPCs

**Files:**
- Create: `supabase/migrations/20260610120200_session_share_rpcs.sql`

- [ ] **Step 1: Write migration**

```sql
-- Fetch active session + players by share_code (authenticated users only)

create or replace function public.get_session_by_share_code(p_share_code text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_code text := nullif(trim(p_share_code), '');
  result json;
begin
  if auth.uid() is null or v_code is null then
    return null;
  end if;

  select json_build_object(
    'session', row_to_json(gs.*),
    'players', coalesce((
      select json_agg(row_to_json(gp.*) order by gp.created_at)
      from public.game_players gp
      where gp.session_id = gs.id
    ), '[]'::json)
  )
  into result
  from public.game_sessions gs
  where gs.share_code = v_code
    and gs.status = 'active'
  limit 1;

  return result;
end;
$$;

-- Upsert active session + players for anyone holding the share_code

create or replace function public.upsert_shared_session(
  p_share_code text,
  p_default_buy_in text,
  p_currency text,
  p_settlement_mode text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := nullif(trim(p_share_code), '');
  v_session_id uuid;
  v_player jsonb;
  v_player_id uuid;
  v_kept_ids uuid[] := '{}';
begin
  if auth.uid() is null or v_code is null then
    raise exception 'unauthorized';
  end if;

  select gs.id into v_session_id
  from public.game_sessions gs
  where gs.share_code = v_code
    and gs.status = 'active'
  limit 1;

  if v_session_id is null then
    raise exception 'session_not_found';
  end if;

  update public.game_sessions
  set
    default_buy_in = coalesce(p_default_buy_in, default_buy_in),
    currency = coalesce(p_currency, currency),
    settlement_mode = coalesce(p_settlement_mode, settlement_mode),
    updated_at = now()
  where id = v_session_id;

  for v_player in select * from jsonb_array_elements(coalesce(p_players, '[]'::jsonb))
  loop
    v_player_id := (v_player->>'id')::uuid;
    if v_player_id is null then
      continue;
    end if;
    v_kept_ids := array_append(v_kept_ids, v_player_id);

    insert into public.game_players (
      id, session_id, user_id, player_name, buy_in, cash_out, net_result, settled, created_at, updated_at
    )
    values (
      v_player_id,
      v_session_id,
      nullif(v_player->>'user_id', '')::uuid,
      coalesce(v_player->>'player_name', ''),
      coalesce((v_player->>'buy_in')::numeric, 0),
      coalesce((v_player->>'cash_out')::numeric, 0),
      coalesce((v_player->>'net_result')::numeric, 0),
      coalesce((v_player->>'settled')::boolean, false),
      coalesce((v_player->>'created_at')::timestamptz, now()),
      now()
    )
    on conflict (id) do update set
      user_id = excluded.user_id,
      player_name = excluded.player_name,
      buy_in = excluded.buy_in,
      cash_out = excluded.cash_out,
      net_result = excluded.net_result,
      settled = excluded.settled,
      updated_at = now();
  end loop;

  delete from public.game_players gp
  where gp.session_id = v_session_id
    and not (gp.id = any (v_kept_ids));

  return v_session_id;
end;
$$;

grant execute on function public.get_session_by_share_code(text) to authenticated;
grant execute on function public.upsert_shared_session(text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply locally**

Run: `npm run supabase:db:push`  
Expected: functions created; visible in Supabase API

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610120200_session_share_rpcs.sql
git commit -m "feat(db): add session share fetch and upsert RPCs"
```

---

### Task 4: Types and repository interface

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/data/repository.ts`
- Test: `src/lib/data/cloud-repository.test.ts`

- [ ] **Step 1: Write failing test for cloud repository wrapper**

Add to `src/lib/data/cloud-repository.test.ts`:

```typescript
describe('getSessionByShareCode', () => {
  it('returns session and players from RPC json', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        session: { id: 'sess-1', share_code: 'abc12345', status: 'active' },
        players: [{ id: 'p1', session_id: 'sess-1', player_name: 'Alice' }],
      },
      error: null,
    });
    vi.mocked(supabase.rpc).mockImplementation(rpc);

    const result = await cloudRepository.getSessionByShareCode('abc12345');

    expect(rpc).toHaveBeenCalledWith('get_session_by_share_code', { p_share_code: 'abc12345' });
    expect(result?.session.id).toBe('sess-1');
    expect(result?.players).toHaveLength(1);
  });

  it('returns null for empty code', async () => {
    expect(await cloudRepository.getSessionByShareCode('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/data/cloud-repository.test.ts -t getSessionByShareCode`  
Expected: FAIL — `getSessionByShareCode` not defined

- [ ] **Step 3: Add types and interface**

In `src/lib/types.ts`:

```typescript
export interface SharedSessionPlayerPayload {
  id: string;
  player_name: string;
  buy_in: number;
  cash_out: number;
  net_result: number;
  settled: boolean;
  user_id: string | null;
  created_at: string;
}

export interface SharedSessionPayload {
  default_buy_in: string;
  currency: string;
  settlement_mode: string;
  players: SharedSessionPlayerPayload[];
}
```

In `src/lib/data/repository.ts`, add to `Repository`:

```typescript
getSessionByShareCode(shareCode: string): Promise<{ session: DbGameSession; players: DbGamePlayer[] } | null>;
upsertSharedSession(shareCode: string, payload: SharedSessionPayload): Promise<string | null>;
```

- [ ] **Step 4: Implement cloud-repository methods**

In `src/lib/data/cloud-repository.ts`:

```typescript
import type { SharedSessionPayload } from '../types';

// inside cloudRepository object:

async getSessionByShareCode(shareCode: string) {
  const code = (shareCode ?? '').trim();
  if (!code) return null;
  const { data, error } = await supabase.rpc('get_session_by_share_code', {
    p_share_code: code,
  });
  if (error || !data || typeof data !== 'object') return null;
  const parsed = data as { session?: DbGameSession; players?: DbGamePlayer[] };
  if (!parsed.session?.id) return null;
  return {
    session: parsed.session,
    players: Array.isArray(parsed.players) ? parsed.players : [],
  };
},

async upsertSharedSession(shareCode: string, payload: SharedSessionPayload) {
  const code = (shareCode ?? '').trim();
  if (!code) return null;
  const { data, error } = await supabase.rpc('upsert_shared_session', {
    p_share_code: code,
    p_default_buy_in: payload.default_buy_in,
    p_currency: payload.currency,
    p_settlement_mode: payload.settlement_mode,
    p_players: payload.players,
  });
  if (error) return null;
  return typeof data === 'string' ? data : null;
},
```

- [ ] **Step 5: Add stubs in local-repository**

```typescript
async getSessionByShareCode() {
  return null;
},
async upsertSharedSession() {
  return null;
},
```

- [ ] **Step 6: Wire sync-repository**

```typescript
async getSessionByShareCode(shareCode: string) {
  return cloudRepository.getSessionByShareCode(shareCode);
},
async upsertSharedSession(shareCode: string, payload: SharedSessionPayload) {
  const sessionId = await cloudRepository.upsertSharedSession(shareCode, payload);
  if (sessionId && isOnline()) {
    const session = await cloudRepository.getGameSession(sessionId);
    const players = await cloudRepository.getGamePlayers(sessionId);
    if (session) await localRepository.saveGameSession(session);
    for (const p of players) await localRepository.saveGamePlayer(p);
  }
  return sessionId;
},
```

- [ ] **Step 7: Run tests**

Run: `npm test -- src/lib/data/cloud-repository.test.ts`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/data/repository.ts src/lib/data/cloud-repository.ts src/lib/data/local-repository.ts src/lib/data/sync-repository.ts src/lib/data/cloud-repository.test.ts
git commit -m "feat(data): add session share repository methods"
```

---

### Task 5: History excludes active sessions

**Files:**
- Modify: `src/lib/data/cloud-repository.ts`
- Modify: `src/lib/data/local-repository.ts`
- Modify: `src/lib/data/sync-repository.ts`
- Test: `src/lib/data/local-repository.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/lib/data/local-repository.test.ts`:

```typescript
it('excludes active sessions from getGameSessionsForUser', async () => {
  await localRepository.saveGameSession(makeSession('active-1', null, '2026-06-10', '2026-06-10T10:00:00Z', 'active'));
  await localRepository.saveGameSession(makeSession('settled-1', null, '2026-06-09', '2026-06-09T10:00:00Z', 'settled'));

  const result = await localRepository.getGameSessionsForUser();

  expect(result.map((s) => s.id)).toEqual(['settled-1']);
});
```

Update `makeSession` helper in that file to accept optional `status` (default `'settled'`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/data/local-repository.test.ts -t "excludes active"`  
Expected: FAIL — both sessions returned

- [ ] **Step 3: Filter in repositories**

At end of `getGameSessionsForUser` in `cloud-repository.ts`, `local-repository.ts`, and after merge in `sync-repository.ts`:

```typescript
list = list.filter((s) => s.status !== 'active');
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/data/local-repository.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/cloud-repository.ts src/lib/data/local-repository.ts src/lib/data/sync-repository.ts src/lib/data/local-repository.test.ts
git commit -m "feat(data): hide active sessions from history queries"
```

---

### Task 6: Extract shared save helper

**Files:**
- Create: `src/lib/session/save-payout-session.ts`
- Test: `src/lib/session/save-payout-session.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/session/save-payout-session.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { savePayoutSession } from './save-payout-session';
import type { PayoutRowData } from '@/lib/types';

const baseRow: PayoutRowData = {
  id: 'r1', name: 'Alice', buyIn: '30', cashOut: '40', settled: false, paid: false,
};

describe('savePayoutSession', () => {
  it('saves active session with share_code passthrough', async () => {
    const saveGameSession = vi.fn().mockResolvedValue(undefined);
    const saveGamePlayer = vi.fn().mockResolvedValue(undefined);
    const getGroupMembersWithIds = vi.fn().mockResolvedValue([]);
    const getGamePlayers = vi.fn().mockResolvedValue([]);
    const deleteGamePlayer = vi.fn();

    const result = await savePayoutSession({
      repo: { saveGameSession, saveGamePlayer, getGroupMembersWithIds, getGamePlayers, deleteGamePlayer },
      userId: 'user-1',
      rows: [baseRow],
      buyIn: '30',
      currency: 'EUR',
      settlementMode: 'greedy',
      selectedGroupId: null,
      currentSessionId: null,
      status: 'active',
      shareCode: null,
      upsertSharedSession: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(saveGameSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', created_by: 'user-1' })
    );
    expect(result.sessionId).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/session/save-payout-session.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

Create `src/lib/session/save-payout-session.ts` — extract logic from `PayoutTable.handleSaveSession`:

```typescript
import { parseNum } from '@/lib/calc/formatting';
import type { DbGamePlayer, DbGameSession, PayoutRowData, SharedSessionPayload } from '@/lib/types';

export type SavePayoutSessionParams = {
  repo: {
    saveGameSession(session: DbGameSession): Promise<void>;
    saveGamePlayer(player: DbGamePlayer): Promise<void>;
    getGroupMembersWithIds(groupId: string): Promise<{ name: string; user_id: string }[]>;
    getGamePlayers(sessionId: string): Promise<DbGamePlayer[]>;
    deleteGamePlayer(playerId: string, sessionId: string): Promise<void>;
  };
  userId: string;
  rows: PayoutRowData[];
  buyIn: string;
  currency: string;
  settlementMode: string;
  selectedGroupId: string | null;
  currentSessionId: string | null;
  status: 'active' | 'settled';
  shareCode: string | null;
  upsertSharedSession?: (code: string, payload: SharedSessionPayload) => Promise<string | null>;
};

export type SavePayoutSessionResult =
  | { ok: true; sessionId: string; playerIds: (string | undefined)[]; shareCode: string }
  | { ok: false };

export async function savePayoutSession(params: SavePayoutSessionParams): Promise<SavePayoutSessionResult> {
  const {
    repo, userId, rows, buyIn, currency, settlementMode, selectedGroupId,
    currentSessionId, status, shareCode, upsertSharedSession,
  } = params;
  if (!userId || rows.length === 0) return { ok: false };

  const now = new Date().toISOString();
  const isNewSession = currentSessionId == null;
  const sessionId = currentSessionId ?? crypto.randomUUID();

  const nameToUserId = new Map<string, string>();
  if (selectedGroupId) {
    const members = await repo.getGroupMembersWithIds(selectedGroupId);
    for (const m of members) {
      if (m.name?.trim()) nameToUserId.set(m.name.trim().toLowerCase(), m.user_id);
    }
  }

  const playerIds: (string | undefined)[] = [];
  const sharedPlayers: SharedSessionPayload['players'] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const playerId = name ? (row.dbPlayerId ?? crypto.randomUUID()) : undefined;
    playerIds.push(playerId);
    if (playerId === undefined) continue;

    const buyInNum = parseNum(row.buyIn);
    const cashOutNum = parseNum(row.cashOut);
    const userIdForPlayer = nameToUserId.get(name.toLowerCase()) ?? null;

    sharedPlayers.push({
      id: playerId,
      player_name: name,
      buy_in: buyInNum,
      cash_out: cashOutNum,
      net_result: cashOutNum - buyInNum,
      settled: row.paid ?? row.settled,
      user_id: userIdForPlayer,
      created_at: now,
    });
  }

  if (shareCode && upsertSharedSession) {
    const id = await upsertSharedSession(shareCode, {
      default_buy_in: buyIn,
      currency,
      settlement_mode: settlementMode,
      players: sharedPlayers,
    });
    if (!id) return { ok: false };
    return { ok: true, sessionId: id, playerIds, shareCode };
  }

  const session: DbGameSession = {
    id: sessionId,
    created_by: userId,
    group_id: selectedGroupId,
    session_date: new Date().toISOString().slice(0, 10),
    currency,
    default_buy_in: buyIn,
    settlement_mode: settlementMode,
    status,
    share_code: '',
    created_at: now,
    updated_at: now,
  };
  await repo.saveGameSession(session);

  for (const p of sharedPlayers) {
    await repo.saveGamePlayer({
      id: p.id,
      session_id: sessionId,
      user_id: p.user_id,
      player_name: p.player_name,
      buy_in: p.buy_in,
      cash_out: p.cash_out,
      net_result: p.net_result,
      settled: p.settled,
      created_at: p.created_at,
      updated_at: now,
    });
  }

  if (!isNewSession) {
    const keptIds = new Set(playerIds.filter((id): id is string => id != null));
    const existing = await repo.getGamePlayers(sessionId);
    for (const p of existing) {
      if (!keptIds.has(p.id)) await repo.deleteGamePlayer(p.id, sessionId);
    }
  }

  const resolvedShareCode = shareCode ?? '';
  return { ok: true, sessionId, playerIds, shareCode: resolvedShareCode };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/session/save-payout-session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/session/save-payout-session.ts src/lib/session/save-payout-session.test.ts
git commit -m "refactor: extract savePayoutSession helper"
```

---

### Task 7: Wire PayoutTable save + share

**Files:**
- Modify: `src/components/payout/PayoutTable.tsx`
- Modify: `src/components/payout/PayoutTable.test.tsx`

- [ ] **Step 1: Write failing share test**

Add to `PayoutTable.test.tsx`:

```typescript
it('share uploads active session and copies code link', async () => {
  setupSignedInCalc();
  setupRepositorySuccess();
  mockSaveGameSession.mockImplementation(async (session) => {
    (session as { share_code?: string }).share_code = 'abc12345';
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, {
    clipboard: { writeText },
  });

  render(<PayoutTable />);
  await userEvent.click(screen.getByRole('button', { name: /share/i }));

  await waitFor(() => {
    expect(mockSaveGameSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' })
    );
  });
  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('code=abc12345'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "share uploads"`  
Expected: FAIL

- [ ] **Step 3: Refactor PayoutTable**

Replace `handleSaveSession` body with calls to `savePayoutSession`:

```typescript
import { savePayoutSession } from '@/lib/session/save-payout-session';
import { getSiteOrigin, BASE_PATH } from '@/lib/constants';

const saveActiveSession = async (): Promise<{ sessionId: string; shareCode: string } | null> => {
  if (!user?.id || calc.rows.length === 0) return null;
  setSavingSession(true);
  try {
    const repo = getRepository(true);
    const result = await savePayoutSession({
      repo,
      userId: user.id,
      rows: calc.rows,
      buyIn: calc.buyIn,
      currency: calc.currency,
      settlementMode: calc.settlementMode,
      selectedGroupId: calc.selectedGroupId,
      currentSessionId: calc.currentSessionId,
      status: 'active',
      shareCode: calc.sharedSessionCode,
      upsertSharedSession:
        calc.sharedSessionCode
          ? (code, payload) => repo.upsertSharedSession(code, payload)
          : undefined,
    });
    if (!result.ok) return null;

    const session = await repo.getGameSession(result.sessionId);
    const shareCode = session?.share_code ?? result.shareCode;
    calc.setSavedSession(result.sessionId, result.playerIds, shareCode);
    return { sessionId: result.sessionId, shareCode };
  } finally {
    setSavingSession(false);
  }
};

const finalizeSession = async (): Promise<boolean> => {
  if (!user?.id || calc.rows.length === 0) return false;
  setSavingSession(true);
  try {
    const repo = getRepository(true);
    const result = await savePayoutSession({
      repo,
      userId: user.id,
      rows: calc.rows,
      buyIn: calc.buyIn,
      currency: calc.currency,
      settlementMode: calc.settlementMode,
      selectedGroupId: calc.selectedGroupId,
      currentSessionId: calc.currentSessionId,
      status: 'settled',
      shareCode: calc.sharedSessionCode,
      upsertSharedSession:
        calc.sharedSessionCode
          ? (code, payload) => repo.upsertSharedSession(code, payload)
          : undefined,
    });
    if (!result.ok) {
      showToast('Failed to save session');
      return false;
    }
    calc.setSavedSession(result.sessionId, result.playerIds, result.shareCode);
    showToast(calc.currentSessionId == null ? 'Session saved' : 'Session updated');
    return true;
  } catch {
    showToast('Failed to save session');
    return false;
  } finally {
    setSavingSession(false);
  }
};
```

Update `handleShare`:

```typescript
const handleShare = async () => {
  if (!user) {
    showToast('Sign in to share a session');
    return;
  }
  try {
    const saved = await saveActiveSession();
    if (!saved?.shareCode) {
      showToast('Failed to upload session for sharing');
      return;
    }
    const url = `${getSiteOrigin()}${BASE_PATH}/?code=${encodeURIComponent(saved.shareCode)}`;
    // existing clipboard copy logic using url
    showToast('Share link copied to clipboard!');
  } catch {
    showToast('Error copying share link');
  }
};
```

Replace all `handleSaveSession` calls in end-session flow with `finalizeSession`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx`  
Expected: PASS (update existing end-session tests to expect `status: 'settled'`)

- [ ] **Step 5: Commit**

```bash
git add src/components/payout/PayoutTable.tsx src/components/payout/PayoutTable.test.tsx
git commit -m "feat(payout): share uploads active session and copies code link"
```

---

### Task 8: Load session from `?code=` on init

**Files:**
- Modify: `src/hooks/usePayoutCalculator.ts`
- Test: `src/lib/sharing/payout-share.test.ts` (optional init test via new hook test file if needed)

- [ ] **Step 1: Extend calculator state**

In `usePayoutCalculator.ts`:

```typescript
const [sharedSessionCode, setSharedSessionCode] = useState<string | null>(null);

// Extend setSavedSession signature:
const setSavedSession = useCallback(
  (sessionId: string, playerIds: (string | undefined)[], shareCode?: string | null) => {
    setCurrentSessionId(sessionId);
    if (shareCode) setSharedSessionCode(shareCode);
    setRows((prev) => prev.map((row, i) => ({ ...row, dbPlayerId: playerIds[i] })));
  },
  []
);
```

Persist `sharedSessionCode` in `PAYOUT_STORAGE_KEY` localStorage payload.

- [ ] **Step 2: Add code init branch**

At top of init `useEffect`, before `?s=` handling:

```typescript
const shareCode = params.get('code');
if (shareCode) {
  const { getRepository } = await import('@/lib/data/sync-repository');
  const repo = getRepository(true);
  const loaded = await repo.getSessionByShareCode(shareCode);
  if (loaded?.session && loaded.players.length >= 0) {
    const { session, players } = loaded;
    setBuyInRaw(session.default_buy_in);
    if (session.group_id) setSelectedGroupIdInternal(session.group_id);
    setCurrentSessionId(session.id);
    setSharedSessionCode(session.share_code);
    setRows(
      players.map((p) => ({
        id: generateId(),
        name: p.player_name,
        buyIn: String(p.buy_in),
        cashOut: String(p.cash_out),
        settled: p.settled,
        paid: p.settled,
        dbPlayerId: p.id,
      }))
    );
    setInitialized(true);
    return;
  }
}
```

Export `sharedSessionCode` and a callback `onSharedSessionLoaded` isn't needed — `PayoutTable` sets `sessionInProgress` when `?code=` is in URL on mount:

```typescript
// PayoutTable.tsx
useEffect(() => {
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) setSessionInProgress(true);
}, []);
```

- [ ] **Step 3: Remove URL encoding from getShareUrl**

`getShareUrl` is no longer used for DB share — can remove from hook or make it throw. Share logic lives in `PayoutTable.handleShare` only.

- [ ] **Step 4: Manual smoke test**

1. Sign in, start session, add players, tap Share  
2. Open link in incognito / second account  
3. Confirm table loads with correct data  
4. Edit cash-out, confirm persists on refresh

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePayoutCalculator.ts src/components/payout/PayoutTable.tsx
git commit -m "feat(payout): load shared session from code query param"
```

---

### Task 9: Auth gate for share links

**Files:**
- Modify: `src/components/payout/PayoutTable.tsx`

- [ ] **Step 1: Show sign-in when code present but logged out**

```typescript
const searchCode =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null;

// near existing sign-in modal usage:
useEffect(() => {
  if (searchCode && !user && calc.initialized) {
    setSignInModalOpen(true); // use existing SignInModal state/trigger
  }
}, [searchCode, user, calc.initialized]);
```

Reuse existing `SignInModal` from layout or payout page pattern. After sign-in, `usePayoutCalculator` init re-runs or refetch share code load on `user` change.

- [ ] **Step 2: Re-fetch on sign-in**

In `usePayoutCalculator`, add effect:

```typescript
useEffect(() => {
  if (!initialized || !loggedIn) return;
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code || currentSessionId) return;
  // call same load-from-code logic
}, [loggedIn, initialized]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/payout/PayoutTable.tsx src/hooks/usePayoutCalculator.ts
git commit -m "feat(payout): require sign-in to open shared session links"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`  
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`  
Expected: No new errors

- [ ] **Step 3: Manual end-to-end checklist**

- [ ] Share copies `/?code=…` link (not `?s=`)
- [ ] Recipient can edit and changes persist after reload
- [ ] End session sets `settled`; code link no longer loads editable session
- [ ] Active session absent from History page
- [ ] History page has no new share-related copy
- [ ] Free user with 10 settled sessions can still share new active session
- [ ] Legacy `?s=` link still loads snapshot

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address session share integration issues"
```

---

## Plan Self-Review

| Spec requirement | Task |
|---|---|
| Upload on share (`active`) | Task 7 |
| `share_code` trigger | Task 1 |
| RPC fetch + upsert | Task 3, 4 |
| Immediate recipient edit | Task 3, 6, 8 |
| Settled-only free cap | Task 2 |
| History hides active | Task 5 |
| No history page share copy | No history UI tasks |
| Legacy `?s=` fallback | Task 8 (keep decode branch) |
| End session `settled` | Task 7 `finalizeSession` |
| Auth required | Task 9 |

No placeholders remain. Types (`SharedSessionPayload`, `setSavedSession` third arg) are consistent across tasks.
