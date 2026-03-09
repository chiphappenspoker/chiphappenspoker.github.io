'use client';

import { useState, useRef, useEffect } from 'react';
import { usePayoutCalculator } from '@/hooks/usePayoutCalculator';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getRepository } from '@/lib/data/sync-repository';
import { clearQueueEntriesForSession } from '@/lib/sync/sync-queue';
import { parseNum } from '@/lib/calc/formatting';
import { NavMenu } from '@/components/layout/NavMenu';
import { PayoutRow } from './PayoutRow';
import { SettlementPanel } from './SettlementPanel';
import { useToast } from '@/hooks/useToast';
import { useSelectGroupModal } from '@/hooks/useSelectGroupModal';
import { fmt, fmtInt, fmtOptionalDecimals } from '@/lib/calc/formatting';

export function PayoutTable() {
  const calc = usePayoutCalculator();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { setOpenSelectGroupModal } = useSelectGroupModal();
  const hasOpenedForNoGroupRef = useRef(false);
  const [savingSession, setSavingSession] = useState(false);
  const [endSessionModalOpen, setEndSessionModalOpen] = useState(false);
  /** When false, show New Session; when true (and user), show End Session. Toggles on New Session click and when End Session modal closes. */
  const [sessionInProgress, setSessionInProgress] = useState(false);

  // When user has a group selected, allow auto-open again after they clear
  useEffect(() => {
    if (calc.selectedGroupId) hasOpenedForNoGroupRef.current = false;
  }, [calc.selectedGroupId]);

  // Prompt to select a group when app loads (or returns to payout page) with no group selected
  useEffect(() => {
    if (!calc.initialized || calc.selectedGroupId || hasOpenedForNoGroupRef.current) return;
    hasOpenedForNoGroupRef.current = true;
    setOpenSelectGroupModal(true);
  }, [calc.initialized, calc.selectedGroupId, setOpenSelectGroupModal]);

  const openEndSessionModal = () => {
    // "End session" includes settle flow: lock table + show settlement UI
    if (!calc.checkboxesVisible) calc.toggleSettle();
    setEndSessionModalOpen(true);
  };

  const closeEndSessionModal = () => {
    setEndSessionModalOpen(false);
    setSessionInProgress(false);
    // exit settle mode when leaving end-session flow
    if (calc.checkboxesVisible) calc.toggleSettle();
  };

  const handleClear = async () => {
    if (calc.currentSessionId) await clearQueueEntriesForSession(calc.currentSessionId);
    calc.clearTable();
    setOpenSelectGroupModal(true);
  };

  const handleNewSessionClick = async () => {
    await handleClear();
    if (user) setSessionInProgress(true);
  };

  const handleSaveSession = async () => {
    if (!user?.id || calc.rows.length === 0) return;
    setSavingSession(true);
    try {
      const repo = getRepository(true);
      const now = new Date().toISOString();
      const isNewSession = calc.currentSessionId == null;
      const sessionId = calc.currentSessionId ?? crypto.randomUUID();
      const session = {
        id: sessionId,
        created_by: user.id,
        group_id: calc.selectedGroupId,
        session_date: new Date().toISOString().slice(0, 10),
        currency: calc.currency,
        default_buy_in: calc.buyIn,
        settlement_mode: calc.settlementMode,
        status: 'settled' as const,
        share_code: '',
        created_at: now,
        updated_at: now,
      };
      await repo.saveGameSession(session);

      const nameToUserId = new Map<string, string>();
      if (calc.selectedGroupId) {
        const members = await repo.getGroupMembersWithIds(calc.selectedGroupId);
        for (const m of members) {
          if (m.name?.trim()) nameToUserId.set(m.name.trim().toLowerCase(), m.user_id);
        }
      }

      const playerIds: (string | undefined)[] = [];
      for (const row of calc.rows) {
        const name = row.name.trim();
        const playerId = name ? (row.dbPlayerId ?? crypto.randomUUID()) : undefined;
        playerIds.push(playerId);
        if (playerId !== undefined) {
          const buyIn = parseNum(row.buyIn);
          const cashOut = parseNum(row.cashOut);
          const userId = nameToUserId.get(name.toLowerCase()) ?? null;
          await repo.saveGamePlayer({
            id: playerId,
            session_id: sessionId,
            user_id: userId,
            player_name: name,
            buy_in: buyIn,
            cash_out: cashOut,
            net_result: cashOut - buyIn,
            settled: row.settled,
            created_at: now,
            updated_at: now,
          });
        }
      }

      if (!isNewSession) {
        const keptIds = new Set(playerIds.filter((id): id is string => id != null));
        const existing = await repo.getGamePlayers(sessionId);
        for (const p of existing) {
          if (!keptIds.has(p.id)) {
            await repo.deleteGamePlayer(p.id, sessionId);
          }
        }
      }

      calc.setSavedSession(sessionId, playerIds);
      showToast(isNewSession ? 'Session saved' : 'Session updated');
    } catch {
      showToast('Failed to save session');
    } finally {
      setSavingSession(false);
    }
  };

  if (!calc.initialized) {
    return (
      <div className="wrap">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted-text">Loading…</p>
        </div>
      </div>
    );
  }

  const handleShare = async () => {
    try {
      const url = await calc.getShareUrl();
      if (navigator.clipboard?.write) {
        const html = `<a href="${url}">Poker Payout Share</a>`;
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([url], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
        showToast('Share link copied to clipboard!');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast('Share link copied to clipboard!');
      } else {
        fallbackCopy(url);
      }
    } catch {
      showToast('Error copying share link');
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(ok ? 'Share link copied to clipboard!' : 'Failed to copy link');
    } catch {
      showToast('Failed to copy link');
    }
  };

  return (
    <div className="wrap">
      <h1 className="page-title">Payout Calculator</h1>
      <div className="card">
        {/* Toolbar */}
        <div className="toolbar">
          <NavMenu activePage="payout" playerNames={calc.getPlayerNames()} />
          <span className="toolbar-icon" aria-hidden="true" title="Poker">
            <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img">
              <title>Spade</title>
              <path
                fill="#d4a832"
                d="M32 6C20 18 8 26 8 36c0 6 5 11 11 11 4 0 8-2 10-5-1 5-3 9-8 12h22c-5-3-7-7-8-12 2 3 6 5 10 5 6 0 11-5 11-11 0-10-12-18-24-30z"
              />
            </svg>
          </span>
          <div
            className={`status ${calc.isBalanced ? 'ok' : 'warn'}`}
            aria-live="polite"
          >
            <span className="dot" />
            <span className="status-text">
              {calc.isBalanced ? 'Balanced' : 'Unbalanced'}
            </span>
          </div>
          <span className="spacer" />
          <OptionsDropdown onShare={handleShare} />
        </div>

        {/* Table */}
        <div className="table-wrap">
          <form onSubmit={(e) => e.preventDefault()}>
            <table className="page-payout-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-step" />
                <col className="col-in" />
                <col className="col-step" />
                <col className="col-out" />
                <col className="col-payout" />
              </colgroup>
              <thead>
                <tr>
                  <th className="controls-cell" colSpan={6}>
                    <div className="controls">
                      <div className="controls-session-center" aria-hidden="true" />
                      <div className="controls-session-wrap">
                        {(!user || !sessionInProgress) ? (
                          <button
                            className="btn btn-secondary btn-session-action"
                            type="button"
                            disabled={calc.tableLocked}
                            onClick={handleNewSessionClick}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <span aria-hidden="true">
                              <svg width="18" height="18" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img">
                                <title>Poker chip</title>
                                <circle cx="32" cy="32" r="30" fill="#d4a832" stroke="#b8860b" strokeWidth="3" />
                                <circle cx="32" cy="32" r="22" fill="none" stroke="#b8860b" strokeWidth="2" />
                                <circle cx="32" cy="32" r="14" fill="none" stroke="#b8860b" strokeWidth="1.5" />
                              </svg>
                            </span>
                            New session
                          </button>
                        ) : (
                        <button
                          className="btn btn-secondary btn-session-action"
                          type="button"
                          disabled={calc.tableLocked || calc.rows.length === 0}
                          onClick={openEndSessionModal}
                        >
                          🏁 End session
                        </button>
                        )}
                      </div>
                      <div className="controls-right-wrap">
                        <div className="buyin-container">
                        <label className="buyin-label" htmlFor="buyInInput">
                          Buy-In
                        </label>
                        <input
                          id="buyInInput"
                          className="input-field buyin-input"
                          type="text"
                          inputMode="numeric"
                          value={calc.buyIn}
                          disabled={calc.tableLocked}
                          onChange={(e) => calc.setBuyIn(e.target.value)}
                          onClick={(e) =>
                            (e.target as HTMLInputElement).select()
                          }
                        />
                        </div>
                      </div>
                    </div>
                  </th>
                </tr>
                <tr>
                  <th>Name</th>
                  <th aria-label="decrement"></th>
                  <th>In</th>
                  <th aria-label="increment"></th>
                  <th>Out</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {calc.rows.map((row, i) => (
                  <PayoutRow
                    key={row.id}
                    name={row.name}
                    buyIn={row.buyIn}
                    cashOut={row.cashOut}
                    settled={row.settled}
                    payout={calc.payouts[i] ?? 0}
                    checkboxesVisible={calc.checkboxesVisible}
                    tableLocked={calc.tableLocked}
                    onUpdateName={(v) => calc.updateRow(i, 'name', v)}
                    onUpdateBuyIn={(v) => calc.updateRow(i, 'buyIn', v)}
                    onUpdateCashOut={(v) => calc.updateRow(i, 'cashOut', v)}
                    onUpdateSettled={(v) => calc.updateRow(i, 'settled', v)}
                    onAdjust={(delta) => calc.adjustBuyIn(i, delta)}
                    onDelete={() => calc.removeRow(i)}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th></th>
                  <th className="payout">{fmtOptionalDecimals(calc.totalIn)}</th>
                  <th></th>
                  <th className="payout">{fmtOptionalDecimals(calc.totalOut)}</th>
                  <th className="payout">{fmtOptionalDecimals(calc.totalPayout)}</th>
                </tr>
              </tfoot>
            </table>
          </form>
        </div>

        {/* Action Row */}
        <div className="action-row">
          <div className="action-buttons">
            <button
              className="btn btn-secondary btn-session-action"
              type="button"
              disabled={calc.tableLocked || calc.rows.length >= 32}
              onClick={() => calc.addRow()}
            >
              ➕ Add Player
            </button>
            <button
              className="btn btn-secondary btn-session-action"
              type="button"
              disabled={calc.tableLocked}
              onClick={calc.toggleSuspects}
            >
              👥 Usual Suspects
            </button>
          </div>

          {/* Usual Suspects */}
          {calc.showSuspects && (
            <div className="suspects-list" style={{ display: 'flex' }}>
              {calc.availableSuspects.map((name) => (
                <span
                  key={name}
                  className="player-chip"
                  onClick={() => calc.addSuspectToRow(name)}
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* End session confirmation modal */}
      {user && endSessionModalOpen && (
        <div className="modal active" role="dialog" aria-modal="true" aria-labelledby="end-session-title">
          <div className="modal-overlay" onClick={closeEndSessionModal} />
          <div className="modal-content" role="document">
            <div className="modal-header">
              <h2 id="end-session-title" className="modal-title">End session</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeEndSessionModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="muted-text" style={{ marginBottom: '1rem' }}>
                {calc.rows.filter((r) => r.name.trim()).length} players · In: {fmtOptionalDecimals(calc.totalIn)} · Out: {fmtOptionalDecimals(calc.totalOut)}
                {calc.isBalanced ? ' · Balanced' : ' · Unbalanced'}
              </p>

              <SettlementPanel
                visible={endSessionModalOpen}
                rows={calc.rows}
                settlementMode={calc.settlementMode}
                currency={calc.currency}
                transactions={calc.transactions}
                usualSuspectsOverride={calc.usualSuspectsForSettlement}
              />

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={savingSession}
                  onClick={closeEndSessionModal}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingSession}
                  onClick={async () => {
                    try {
                      await handleSaveSession();
                      closeEndSessionModal();
                    } catch {
                      /* toast already shown */
                    }
                  }}
                >
                  {savingSession ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Options dropdown (share) ── */

function OptionsDropdown({ onShare }: { onShare: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        className="options-btn"
        aria-label="Options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        ⋮
      </button>
      {open && (
        <div className="options-dropdown active">
          <button
            className="options-item"
            type="button"
            onClick={() => {
              setOpen(false);
              onShare();
            }}
          >
            ↗️ Share
          </button>
        </div>
      )}
    </div>
  );
}
