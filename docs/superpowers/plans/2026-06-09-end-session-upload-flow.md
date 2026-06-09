# End Session Upload Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm upload when ending a session, auto-upload on Yes, then show a read-only summary modal with payment links and optional retry on failure.

**Architecture:** Add a confirm modal step before the existing summary modal in `PayoutTable.tsx`. Reuse `handleSaveSession()` for upload and retry. Gate `sessionInProgress` clearing on successful upload (`calc.currentSessionId` set). No backend or repository changes.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-06-09-end-session-upload-flow-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/payout/PayoutTable.tsx` | Modify | New confirm modal, upload handlers, summary modal cleanup, state wiring |
| `src/components/payout/PayoutTable.test.tsx` | Modify | End-session flow tests (confirm, upload, retry, close behavior) |
| `src/app/globals.css` | Modify (optional) | `.end-session-upload-failed` banner styling if inline styles are insufficient |

All logic stays in `PayoutTable.tsx` — no new files needed. Follow existing modal patterns from reset-table and rebalance modals in the same file.

---

### Task 1: Test harness + confirm modal opens

**Files:**
- Modify: `src/components/payout/PayoutTable.test.tsx`
- Test: `src/components/payout/PayoutTable.test.tsx`

- [ ] **Step 1: Add shared mocks for signed-in end-session tests**

Add below existing mocks in `PayoutTable.test.tsx`:

```typescript
const mockShowToast = vi.fn();
const mockSaveGameSession = vi.fn();
const mockSaveGamePlayer = vi.fn();
const mockGetGroupMembersWithIds = vi.fn(async () => []);
const mockGetGamePlayers = vi.fn(async () => []);
const mockDeleteGamePlayer = vi.fn(async () => undefined);

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('./SettlementPanel', () => ({
  SettlementPanel: () => <div data-testid="settlement-panel">Settlement</div>,
}));

import { getRepository } from '@/lib/data/sync-repository';

const signedInUser = { id: 'user-1' };

function mockSignedInAuth() {
  vi.doMock('@/lib/auth/AuthProvider', () => ({
    useAuth: () => ({ user: signedInUser }),
  }));
}

function setupSignedInCalc(overrides: Partial<typeof mockCalcBase> = {}) {
  mockUsePayoutCalculator.mockReturnValue({
    ...mockCalcBase,
    rows: [
      { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false },
    ],
    isBalanced: true,
    totalIn: 50,
    totalOut: 50,
    clearTable: vi.fn(),
    setSavedSession: vi.fn(),
    ...overrides,
  });
}

function setupRepositorySuccess() {
  vi.mocked(getRepository).mockReturnValue({
    saveGameSession: mockSaveGameSession.mockResolvedValue(undefined),
    saveGamePlayer: mockSaveGamePlayer.mockResolvedValue(undefined),
    getGroupMembersWithIds: mockGetGroupMembersWithIds,
    getGamePlayers: mockGetGamePlayers,
    deleteGamePlayer: mockDeleteGamePlayer,
  } as unknown as ReturnType<typeof getRepository>);
}

function setupRepositoryFailure() {
  vi.mocked(getRepository).mockReturnValue({
    saveGameSession: mockSaveGameSession.mockRejectedValue(new Error('network')),
    saveGamePlayer: mockSaveGamePlayer,
    getGroupMembersWithIds: mockGetGroupMembersWithIds,
    getGamePlayers: mockGetGamePlayers,
    deleteGamePlayer: mockDeleteGamePlayer,
  } as unknown as ReturnType<typeof getRepository>);
}
```

**Note:** Because `useAuth` is already mocked at module level with `user: null`, replace the existing auth mock with a mutable helper:

```typescript
let mockUser: { id: string } | null = null;

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));
```

Reset `mockUser = null` in existing `beforeEach` blocks; set `mockUser = signedInUser` in the new describe block.

- [ ] **Step 2: Write failing test — End Session opens confirm modal**

Add new describe block:

```typescript
describe('PayoutTable end session upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = signedInUser;
    setupSignedInCalc();
    setupRepositorySuccess();
  });

  it('opens confirm modal (not summary) when End Session is clicked', () => {
    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    expect(screen.getByRole('dialog', { name: /end session\?/i })).toBeInTheDocument();
    expect(screen.getByText(/do you want to end the session and upload/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /^end session$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "opens confirm modal" --run`

Expected: FAIL — confirm dialog not found (summary opens directly today)

- [ ] **Step 4: Commit**

```bash
git add src/components/payout/PayoutTable.test.tsx
git commit -m "test: add failing test for end-session confirm modal"
```

---

### Task 2: Wire confirm modal opening

**Files:**
- Modify: `src/components/payout/PayoutTable.tsx:36-92`

- [ ] **Step 1: Add state and update entry points**

In `PayoutTable.tsx`, add state after existing modal state:

```typescript
const [endSessionConfirmOpen, setEndSessionConfirmOpen] = useState(false);
const [uploadFailedOnEnd, setUploadFailedOnEnd] = useState(false);
```

Change `openEndSessionModal` balanced path (line ~62):

```typescript
} else {
  setEndSessionConfirmOpen(true);
}
```

Change `handleRebalanceConfirm` (line ~83):

```typescript
setRebalanceModalOpen(false);
setEndSessionConfirmOpen(true);
```

Update `tableLocked`:

```typescript
const tableLocked =
  endSessionConfirmOpen ||
  endSessionModalOpen ||
  rebalanceModalOpen ||
  endSessionProOnlyModalOpen;
```

Update inactivity `useEffect` guard (line ~216) to also pause during confirm:

```typescript
if (!sessionInProgress || endSessionConfirmOpen || endSessionModalOpen || inactivityReminderOpen) {
```

Add `endSessionConfirmOpen` to the effect dependency array.

- [ ] **Step 2: Add confirm modal JSX**

Insert before the existing `{/* End session confirmation modal */}` comment (line ~724). Use the reset-table modal as the markup template:

```tsx
{user && endSessionConfirmOpen && (
  <div
    className="modal active"
    role="dialog"
    aria-modal="true"
    aria-labelledby="end-session-confirm-title"
  >
    <div
      className="modal-overlay"
      onClick={() => setEndSessionConfirmOpen(false)}
    />
    <div className="modal-content" role="document">
      <div className="modal-header">
        <h2 id="end-session-confirm-title" className="modal-title">
          End session?
        </h2>
        <button
          type="button"
          className="modal-close"
          onClick={() => setEndSessionConfirmOpen(false)}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="muted-text" style={{ marginBottom: '1rem' }}>
          Do you want to end the session and upload?
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            disabled={savingSession}
            onClick={() => setEndSessionConfirmOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingSession}
            onClick={() => void handleConfirmEndAndUpload()}
          >
            {savingSession ? 'Uploading…' : 'End & upload'}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
```

Add stub handler (will flesh out in Task 3):

```typescript
const handleConfirmEndAndUpload = async () => {
  setEndSessionConfirmOpen(false);
  setEndSessionModalOpen(true);
};
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "opens confirm modal" --run`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/payout/PayoutTable.tsx
git commit -m "feat: show confirm modal before end-session summary"
```

---

### Task 3: Cancel on confirm keeps session going

**Files:**
- Modify: `src/components/payout/PayoutTable.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
it('dismisses confirm on Cancel without opening summary or uploading', async () => {
  render(<PayoutTable />);

  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

  expect(screen.queryByRole('dialog', { name: /end session\?/i })).not.toBeInTheDocument();
  expect(screen.queryByTestId('settlement-panel')).not.toBeInTheDocument();
  expect(mockSaveGameSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "dismisses confirm on Cancel" --run`

Expected: PASS (Cancel wiring already done in Task 2)

- [ ] **Step 3: Commit**

```bash
git add src/components/payout/PayoutTable.test.tsx
git commit -m "test: confirm cancel dismisses without upload"
```

---

### Task 4: Upload on confirm + open read-only summary

**Files:**
- Modify: `src/components/payout/PayoutTable.tsx:86-202,724-781`
- Modify: `src/components/payout/PayoutTable.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
it('uploads and opens summary without Save or Discard buttons', async () => {
  render(<PayoutTable />);

  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  await waitFor(() => {
    expect(mockSaveGameSession).toHaveBeenCalledTimes(1);
  });

  expect(screen.queryByRole('dialog', { name: /end session\?/i })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: /^end session$/i })).toBeInTheDocument();
  expect(screen.getByTestId('settlement-panel')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument();
  expect(mockShowToast).toHaveBeenCalledWith('Session saved');
});

it('shows Uploading… and disables buttons while saving', async () => {
  let resolveSave!: () => void;
  mockSaveGameSession.mockImplementation(
    () => new Promise<void>((resolve) => { resolveSave = resolve; })
  );

  render(<PayoutTable />);
  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  expect(screen.getByRole('button', { name: /uploading/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();

  await act(async () => {
    resolveSave();
    await Promise.resolve();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "uploads and opens summary" --run`

Expected: FAIL — Save/Discard still present or upload not called

- [ ] **Step 3: Implement upload handler and remove Save/Discard**

Replace stub `handleConfirmEndAndUpload`:

```typescript
const handleConfirmEndAndUpload = async () => {
  const saved = await handleSaveSession();
  setEndSessionConfirmOpen(false);
  setUploadFailedOnEnd(!saved);
  setEndSessionModalOpen(true);
};
```

Update `closeEndSessionModal`:

```typescript
const closeEndSessionModal = () => {
  setEndSessionModalOpen(false);
  setUploadFailedOnEnd(false);
  if (calc.currentSessionId) {
    setSessionInProgress(false);
  }
};
```

In the summary modal JSX, **delete** the entire footer `<div>` containing Save and Discard buttons (lines ~755-777). Keep header, stats, and `SettlementPanel`.

Update summary modal comment to `{/* End session summary modal */}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "uploads and opens summary|Uploading" --run`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/payout/PayoutTable.tsx src/components/payout/PayoutTable.test.tsx
git commit -m "feat: auto-upload on confirm and show read-only summary"
```

---

### Task 5: Upload failure banner + retry

**Files:**
- Modify: `src/components/payout/PayoutTable.tsx`
- Modify: `src/components/payout/PayoutTable.test.tsx`
- Modify (optional): `src/app/globals.css`

- [ ] **Step 1: Write failing tests**

```typescript
it('shows retry banner when upload fails but still opens summary', async () => {
  setupRepositoryFailure();

  render(<PayoutTable />);
  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  await waitFor(() => {
    expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
  expect(screen.getByTestId('settlement-panel')).toBeInTheDocument();
  expect(mockShowToast).toHaveBeenCalledWith('Failed to save session');
});

it('clears retry banner after successful retry', async () => {
  setupRepositoryFailure();

  render(<PayoutTable />);
  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
  });

  setupRepositorySuccess();
  fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

  await waitFor(() => {
    expect(screen.queryByText(/upload failed/i)).not.toBeInTheDocument();
  });

  expect(mockSaveGameSession).toHaveBeenCalledTimes(2);
  expect(mockShowToast).toHaveBeenLastCalledWith('Session saved');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "retry banner" --run`

Expected: FAIL — no banner or retry button

- [ ] **Step 3: Implement retry handler and banner**

Add handler:

```typescript
const handleRetryUpload = async () => {
  const saved = await handleSaveSession();
  if (saved) {
    setUploadFailedOnEnd(false);
  }
};
```

In summary modal body, **above** the stats `<p>`, add conditional banner:

```tsx
{uploadFailedOnEnd && (
  <div
    className="end-session-upload-failed"
    role="alert"
    style={{
      marginBottom: '1rem',
      padding: '0.75rem 1rem',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-warn)',
      background: 'rgba(239, 68, 68, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      flexWrap: 'wrap',
    }}
  >
    <span className="warn">Upload failed. Check your connection.</span>
    <button
      type="button"
      className="btn btn-secondary"
      disabled={savingSession}
      onClick={() => void handleRetryUpload()}
    >
      {savingSession ? 'Uploading…' : 'Retry'}
    </button>
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "retry banner|successful retry" --run`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/payout/PayoutTable.tsx src/components/payout/PayoutTable.test.tsx
git commit -m "feat: add upload-failed retry banner in end-session summary"
```

---

### Task 6: Close behavior — session ends only after successful upload

**Files:**
- Modify: `src/components/payout/PayoutTable.test.tsx`

- [ ] **Step 1: Write failing tests using fake timers**

```typescript
it('keeps session in progress after closing summary when upload failed', async () => {
  vi.useFakeTimers();
  setupRepositoryFailure();

  render(<PayoutTable />);

  // Start session so inactivity timer is active
  fireEvent.click(screen.getByRole('button', { name: /new session/i }));
  await act(async () => { await Promise.resolve(); });

  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: /^end session$/i })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

  await act(async () => {
    vi.advanceTimersByTime(31 * 60 * 1000);
  });

  expect(screen.getByRole('dialog', { name: /still playing/i })).toBeInTheDocument();

  vi.useRealTimers();
});

it('ends session after closing summary when upload succeeded', async () => {
  vi.useFakeTimers();

  render(<PayoutTable />);

  fireEvent.click(screen.getByRole('button', { name: /new session/i }));
  await act(async () => { await Promise.resolve(); });

  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: /^end session$/i })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

  await act(async () => {
    vi.advanceTimersByTime(31 * 60 * 1000);
  });

  expect(screen.queryByRole('dialog', { name: /still playing/i })).not.toBeInTheDocument();

  vi.useRealTimers();
});
```

**Note:** `closeEndSessionModal` logic from Task 4 should make these pass. If New Session triggers reset-table confirm because rows have data, the test setup already has Alice row — expect reset confirm and click Continue:

```typescript
fireEvent.click(screen.getByRole('button', { name: /new session/i }));
if (screen.queryByText(/this will reset the table/i)) {
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "keeps session in progress|ends session after closing" --run`

Expected: PASS (if closeEndSessionModal already conditional on `calc.currentSessionId`)

If fail because `setSavedSession` mock doesn't update `currentSessionId`, wire mock:

```typescript
let currentSessionId: string | null = null;
const setSavedSession = vi.fn((id: string) => { currentSessionId = id; });

// in setupSignedInCalc:
mockUsePayoutCalculator.mockImplementation(() => ({
  ...mockCalcBase,
  currentSessionId,
  setSavedSession,
  rows: [...],
  ...
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/components/payout/PayoutTable.test.tsx
git commit -m "test: verify session ends only after successful upload close"
```

---

### Task 7: Re-end updates existing session

**Files:**
- Modify: `src/components/payout/PayoutTable.test.tsx`

- [ ] **Step 1: Write test**

```typescript
it('updates the same session when ending again after edits', async () => {
  let currentSessionId: string | null = null;
  const setSavedSession = vi.fn((id: string) => { currentSessionId = id; });

  mockUsePayoutCalculator.mockImplementation(() => ({
    ...mockCalcBase,
    currentSessionId,
    setSavedSession,
    rows: [
      { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false },
    ],
    isBalanced: true,
    totalIn: 50,
    totalOut: 50,
    updateRow: vi.fn(),
    clearTable: vi.fn(),
  }));

  const { rerender } = render(<PayoutTable />);

  // First end + upload
  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));
  await waitFor(() => expect(setSavedSession).toHaveBeenCalledTimes(1));
  const firstSessionId = setSavedSession.mock.calls[0][0];

  fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

  // Simulate edit + re-render with existing session id
  mockUsePayoutCalculator.mockImplementation(() => ({
    ...mockCalcBase,
    currentSessionId: firstSessionId,
    setSavedSession,
    rows: [
      { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '60', paid: false, settled: false, dbPlayerId: 'p1' },
    ],
    isBalanced: true,
    totalIn: 50,
    totalOut: 60,
    updateRow: vi.fn(),
    clearTable: vi.fn(),
  }));
  rerender(<PayoutTable />);

  fireEvent.click(screen.getByRole('button', { name: /end session/i }));
  fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

  await waitFor(() => expect(setSavedSession).toHaveBeenCalledTimes(2));
  expect(setSavedSession.mock.calls[1][0]).toBe(firstSessionId);
  expect(mockShowToast).toHaveBeenLastCalledWith('Session updated');
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- src/components/payout/PayoutTable.test.tsx -t "updates the same session" --run`

Expected: PASS (existing `handleSaveSession` logic, no code changes needed)

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/payout/PayoutTable.test.tsx
git commit -m "test: re-end after edits updates existing session"
```

---

### Task 8: Manual smoke test

**Files:** none

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify happy path**

1. Sign in, select a group, add players with cash-outs
2. Click End Session → confirm modal appears
3. Click End & upload → summary opens with payment links, no Save/Discard
4. Close summary → table unchanged, upload status shows "Uploaded"

- [ ] **Step 3: Verify cancel path**

1. Click End Session → Cancel → back to table, no upload

- [ ] **Step 4: Verify offline/failure path**

1. DevTools → Network → Offline
2. End Session → End & upload → summary with retry banner
3. Close without retry → session still active (inactivity timer resumes after New Session)
4. Go online → End Session → Retry succeeds

---

## Spec Coverage Checklist

| Spec requirement | Task |
|---|---|
| Confirm prompt on End Session | Task 1–2 |
| No → cancel, session continues | Task 3 |
| Yes → auto-upload then summary | Task 4 |
| Remove Save / Discard | Task 4 |
| Upload failure → summary + retry | Task 5 |
| Close after success → session ended, table unchanged | Task 6 |
| Close after failure → session in progress | Task 6 |
| Re-end updates same session | Task 7 |
| Rebalance → confirm (not summary) | Task 2 |
| Inactivity "End session now" → same path | Task 2 (uses `openEndSessionModal`) |
| `tableLocked` during confirm | Task 2 |
| Ad-hoc / Pro gate unchanged | Existing tests in file |

## Out of Scope (do not implement)

- Ad-hoc / Pro gate changes
- Rebalance modal logic changes
- Auto-clearing table after end
- Repository / sync-engine changes
