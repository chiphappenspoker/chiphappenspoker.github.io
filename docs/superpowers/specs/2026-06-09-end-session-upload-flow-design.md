# End Session Upload Flow — Design Spec

**Date:** 2026-06-09  
**Status:** Approved (brainstorming)  
**Approach:** Option A — Two separate modals

## Problem

Today, clicking **End Session** opens a single modal with session summary, payment links, and **Save** / **Discard** buttons. Upload only happens when the user explicitly clicks Save. This splits the "end session" intent from the upload action and adds an unnecessary decision in the summary view.

## Goal

When the user ends a session, confirm upload upfront, perform the upload automatically, then show a read-only summary modal with payment links. Remove Save and Discard from the summary modal.

## Requirements (from brainstorming)

| Decision | Choice |
|---|---|
| Confirm prompt on End Session | Yes — "Do you want to end the session and upload?" |
| User selects No | Cancel — stay on payout table, session continues |
| User selects Yes | Upload automatically, then show summary modal |
| Upload fails | Show summary modal anyway with retry option |
| After closing summary (upload succeeded) | End session (`sessionInProgress = false`), table stays as-is |
| Re-end after table edits | Update the previously uploaded session (existing `currentSessionId` behavior) |
| Upload failed + close without retry | Session stays in progress |

## Current Flow (reference)

```
End Session
  → Ad-hoc gate (Pro modal) — unchanged
  → Rebalance modal if unbalanced — unchanged
  → End session modal (summary + Save / Discard)
```

Key files:
- `src/components/payout/PayoutTable.tsx` — orchestrates end-session flow, `handleSaveSession()`
- `src/lib/data/sync-repository.ts` — local save + cloud sync on upload
- `src/components/payout/SettlementPanel.tsx` — payment links in summary

## Proposed Flow

```
End Session
  → [unchanged] Ad-hoc gate (Pro modal)
  → [unchanged] Rebalance modal if unbalanced
  → [NEW] Confirm modal: "End session and upload?"
       Cancel  → dismiss, session continues
       End & upload → handleSaveSession() with loading state
            → success → Summary modal (read-only)
            → failure → Summary modal + upload-failed banner + Retry
  → Close summary (upload succeeded) → sessionInProgress = false, table unchanged
  → Re-end after edits → handleSaveSession updates same session ID
```

Inactivity reminder's **End session now** follows the same path via `openEndSessionModal()`.

## UI Components

### 1. Confirm modal (new)

Uses existing modal CSS (`modal`, `modal-content`, `modal-header`, etc.) — same pattern as reset-table and rebalance modals.

| Element | Content |
|---|---|
| Title | End session? |
| Body | Do you want to end the session and upload? |
| Cancel (secondary) | Closes confirm, no state change |
| End & upload (primary) | Triggers upload |
| Loading state | Primary shows "Uploading…", both buttons disabled |

Overlay click and Cancel behave identically (dismiss confirm, session continues).

### 2. Summary modal (modified)

| Keep | Remove | Add |
|---|---|---|
| Player count / In / Out / Balanced stats | Save button | Upload-failed banner (conditional) |
| SettlementPanel (payment links) | Discard button | Retry button (inside banner) |
| Close (✕) | | |

On upload failure, show a warning banner above the stats:

> Upload failed. Check your connection.

With a **Retry** button that re-runs `handleSaveSession()`. On retry success: hide banner, show success toast, summary card updates to "Uploaded".

## State

All state lives in `PayoutTable.tsx`:

| State variable | Type | Purpose |
|---|---|---|
| `endSessionConfirmOpen` | boolean | Confirm dialog visible |
| `endSessionModalOpen` | boolean | Summary modal visible (existing, repurposed) |
| `uploadFailedOnEnd` | boolean | Show retry banner in summary |
| `savingSession` | boolean | Loading during upload (confirm + retry) |

`tableLocked` should include `endSessionConfirmOpen` so the table is locked during confirm.

## Data Flow

### openEndSessionModal (modified)

After existing ad-hoc and rebalance gates, set `endSessionConfirmOpen = true` instead of `endSessionModalOpen = true`.

### handleRebalanceConfirm (modified)

After rebalance, set `endSessionConfirmOpen = true` instead of `endSessionModalOpen = true`.

### handleConfirmEndAndUpload (new)

```typescript
async function handleConfirmEndAndUpload() {
  const saved = await handleSaveSession();
  setEndSessionConfirmOpen(false);
  if (saved) {
    setUploadFailedOnEnd(false);
  } else {
    setUploadFailedOnEnd(true);
  }
  setEndSessionModalOpen(true);
}
```

### closeEndSessionModal (modified)

```typescript
function closeEndSessionModal() {
  setEndSessionModalOpen(false);
  setUploadFailedOnEnd(false);
  // Only end session if upload succeeded (currentSessionId is set)
  if (calc.currentSessionId) {
    setSessionInProgress(false);
  }
}
```

### handleRetryUpload (new)

Re-runs `handleSaveSession()`. On success: `setUploadFailedOnEnd(false)`, toast. On failure: keep banner, toast error.

## Error Handling

| Scenario | Behavior |
|---|---|
| Upload succeeds | Summary opens, no banner, toast "Session saved" / "Session updated" |
| Upload fails | Summary opens with failure banner + Retry; toast "Failed to save session" |
| Retry succeeds | Banner hidden, toast success |
| Retry fails | Banner stays, toast error |
| Close summary after success | Session ended, table unchanged |
| Close summary after failure | Session stays in progress |
| Offline | Same as upload failure — local save may succeed via sync queue; cloud failure shows retry |

No changes to `handleSaveSession()` or `sync-repository` are required for the initial implementation. Retry reuses the same function.

## Out of Scope

- Changing ad-hoc / Pro gate behavior
- Changing rebalance modal logic
- Auto-clearing the table after end session
- New session creation flow changes
- Signed-out / local-only session upload (End Session requires signed-in user today)

## Testing

Update `src/components/payout/PayoutTable.test.tsx`:

1. End Session opens confirm modal (not summary directly)
2. Cancel on confirm keeps session in progress, no summary
3. End & upload opens summary without Save/Discard buttons
4. Upload failure shows retry banner in summary
5. Retry success clears banner
6. Closing summary after successful upload sets session ended
7. Closing summary after failed upload keeps session in progress

## Implementation Notes

- Reuse existing modal markup patterns from reset-table and rebalance modals for the confirm dialog
- `savingSession` state already exists — reuse for confirm and retry loading
- Summary card upload status (`Uploaded` / `Not uploaded`) already reads `calc.currentSessionId` — no change needed
- Remove the footer button row from the end-session modal entirely
