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
import {
  getRebalanceDirection,
  getRebalanceDifference,
  applyRebalance,
  applyRoundingCorrection,
  type RebalanceOptionIndex,
  type RebalanceDirection,
} from '@/lib/calc/rebalance';

/** Buy-in card layout: 'main-sub' (group left, buy-in right with border) | 'equal' (two columns) | 'inline' (single row of items) */
const BUYIN_CARD_LAYOUT = 'equal';

export function PayoutTable() {
  const calc = usePayoutCalculator();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { setOpenSelectGroupModal, setGroupSelectedCallback } = useSelectGroupModal();
  const [savingSession, setSavingSession] = useState(false);
  const [endSessionModalOpen, setEndSessionModalOpen] = useState(false);
  /** When false, show New Session; when true (and user), show End Session. Toggles on New Session click and when End Session modal closes. */
  const [sessionInProgress, setSessionInProgress] = useState(false);
  const [usualSuspectsModalOpen, setUsualSuspectsModalOpen] = useState(false);
  /** Checked names in Usual Suspects modal; synced from table when modal opens. */
  const [suspectsChecked, setSuspectsChecked] = useState<Set<string>>(new Set());
  const [resetTableConfirmOpen, setResetTableConfirmOpen] = useState(false);
  const [rebalanceModalOpen, setRebalanceModalOpen] = useState(false);

  const openEndSessionModal = () => {
    if (!calc.isBalanced && getRebalanceDirection(calc.totalIn, calc.totalOut)) {
      setRebalanceModalOpen(true);
    } else {
      setEndSessionModalOpen(true);
    }
  };

  const handleRebalanceConfirm = (optionIndex: RebalanceOptionIndex) => {
    const direction = getRebalanceDirection(calc.totalIn, calc.totalOut);
    if (direction && optionIndex !== 3) {
      const ctx = {
        rows: calc.rows,
        totalIn: calc.totalIn,
        totalOut: calc.totalOut,
        payouts: calc.payouts,
      };
      let newOuts = applyRebalance(ctx, optionIndex, direction);
      newOuts = newOuts.map((v) => Math.round(v * 100) / 100);
      newOuts = applyRoundingCorrection(calc.rows, newOuts, calc.totalIn);
      newOuts.forEach((val, i) => {
        calc.updateRow(i, 'cashOut', fmtOptionalDecimals(val));
      });
    }
    setRebalanceModalOpen(false);
    setEndSessionModalOpen(true);
  };

  const closeEndSessionModal = () => {
    setEndSessionModalOpen(false);
    setSessionInProgress(false);
  };

  const tableLocked = endSessionModalOpen || rebalanceModalOpen;

  const handleClear = async () => {
    if (calc.currentSessionId) await clearQueueEntriesForSession(calc.currentSessionId);
    calc.clearTable();
    setSessionInProgress(false);
  };

  const proceedNewSession = async () => {
    await handleClear();
    setGroupSelectedCallback(() => setSessionInProgress(true));
    setOpenSelectGroupModal(true);
  };

  const handleNewSessionClick = () => {
    const isEdited = calc.rows.some((r) => r.name.trim() || r.cashOut.trim());
    if (isEdited) {
      setResetTableConfirmOpen(true);
    } else {
      proceedNewSession();
    }
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
            settled: row.paid ?? row.settled,
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
          <span className="spacer" />
          <OptionsDropdown onShare={handleShare} />
        </div>

        {/* Buy-in card (above table). Layout: 'main-sub' | 'equal' | 'inline' — change BUYIN_CARD_LAYOUT below to switch. */}
        <div className={`buyin-card card buyin-card--layout-${BUYIN_CARD_LAYOUT}`}>
          <div className="card-content buyin-card-content">
            <div className="buyin-card-main">
              <span className="buyin-card-main-label">Group</span>
              <span className="buyin-card-main-value">
                {calc.selectedGroup ? calc.selectedGroup.name : 'No group'}
              </span>
            </div>
            <div className="buyin-card-sub">
              <div className="buyin-card-item">
                <label className="buyin-card-label" htmlFor="buyInInput">
                  Buy-In
                </label>
                <input
                  id="buyInInput"
                  className="input-field buyin-input"
                  type="text"
                  inputMode="numeric"
                  value={calc.buyIn}
                  disabled={tableLocked}
                  onChange={(e) => calc.setBuyIn(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <form onSubmit={(e) => e.preventDefault()}>
            <table className="page-payout-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-in" />
                <col className="col-out" />
                <col className="col-payout" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {calc.rows.map((row, i) => (
                  <PayoutRow
                    key={row.id}
                    name={row.name}
                    buyIn={row.name.trim() ? row.buyIn : '0'}
                    cashOut={row.cashOut}
                    paid={row.paid ?? false}
                    payout={calc.payouts[i] ?? 0}
                    tableLocked={tableLocked}
                    onUpdateName={(v) => calc.updateRow(i, 'name', v)}
                    onUpdateBuyIn={(v) => calc.updateRow(i, 'buyIn', v)}
                    onUpdateCashOut={(v) => calc.updateRow(i, 'cashOut', v)}
                    onAdjust={(delta) => calc.adjustBuyIn(i, delta)}
                    onDelete={() => calc.removeRow(i)}
                    onMarkPaid={() => calc.updateRow(i, 'paid', !row.paid)}
                  />
                ))}
              </tbody>
            </table>
          </form>

        {/* Action Row: Add player, Usual suspects, gap, New session, End session */}
        <div className="action-row">
          <div className="action-buttons">
            <button
              className="btn btn-secondary btn-session-action btn-icon-only"
              type="button"
              disabled={tableLocked || calc.rows.length >= 32}
              onClick={() => calc.addRow()}
              aria-label="Add player"
            >
              <span aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </span>
            </button>
            <button
              className="btn btn-secondary btn-session-action btn-icon-only"
              type="button"
              disabled={tableLocked}
              onClick={() => {
                setSuspectsChecked(
                  new Set(calc.rows.map((r) => r.name.trim()).filter(Boolean))
                );
                setUsualSuspectsModalOpen(true);
              }}
              aria-label="Usual suspects"
            >
              <span aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
            </button>
            <span className="action-btn-spacer" aria-hidden="true" />
            <button
              className="btn btn-secondary btn-session-action btn-icon-only"
              type="button"
              disabled={tableLocked}
              onClick={handleNewSessionClick}
              aria-label="New session"
            >
              <span aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </span>
            </button>
            <button
              className="btn btn-secondary btn-session-action btn-icon-only"
              type="button"
              disabled={tableLocked || calc.rows.length === 0 || !calc.selectedGroupId}
              onClick={openEndSessionModal}
              aria-label="End session"
              title={!calc.selectedGroupId ? 'Select a group (New session) first' : undefined}
            >
              <span aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </span>
            </button>
          </div>

          </div>

          {/* Summary card: Total Pot, Balanced/Unbalanced, missing amount, player count */}
          {(() => {
            const imbalance = calc.totalIn - calc.totalOut;
            const imbalanceAbs = Math.abs(imbalance);
            const imbalanceSign = imbalance >= 0 ? '+' : '-';
            return (
          <div
            className={`payout-summary-card card${calc.isBalanced ? ' payout-summary-card--balanced' : ' payout-summary-card--unbalanced'}`}
            aria-live="polite"
          >
            <div className="card-content payout-summary-card-content">
              <div className="payout-summary-main">
                <span className="payout-summary-main-label">Total pot</span>
                <span className="payout-summary-main-value">
                  {fmtOptionalDecimals(calc.totalIn)} {calc.currency}
                </span>
              </div>
              <div className="payout-summary-sub">
                <div className="payout-summary-item">
                  <span className="payout-summary-label">Total in</span>
                  <span className="payout-summary-value">
                    {fmtOptionalDecimals(calc.totalIn)} {calc.currency}
                  </span>
                </div>
                <div className="payout-summary-item">
                  <span className="payout-summary-label">Total out</span>
                  <span className="payout-summary-value">
                    {fmtOptionalDecimals(calc.totalOut)} {calc.currency}
                  </span>
                </div>
                {!calc.isBalanced && (
                  <div className="payout-summary-item">
                    <span className="payout-summary-label">Difference</span>
                    <span
                      className="payout-summary-value payout-summary-difference"
                      title="|Total in − Total out|"
                    >
                      {imbalanceSign}{fmtOptionalDecimals(imbalanceAbs)} {calc.currency}
                    </span>
                  </div>
                )}
                <div className="payout-summary-item">
                  <span className="payout-summary-label">Status</span>
                  <span className={`payout-summary-value payout-summary-status ${calc.isBalanced ? 'ok' : 'warn'}`}>
                    {calc.isBalanced ? 'Balanced' : 'Unbalanced'}
                  </span>
                </div>
                <div className="payout-summary-item">
                  <span className="payout-summary-label">Players</span>
                  <span className="payout-summary-value">
                    {calc.rows.filter((r) => r.name.trim()).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
            );
          })()}
        </div>
      </div>

      {/* Rebalance options modal (when session is unbalanced, shown before End session) */}
      {rebalanceModalOpen && (() => {
        const direction = getRebalanceDirection(calc.totalIn, calc.totalOut);
        const diff = getRebalanceDifference(calc.totalIn, calc.totalOut);
        const outGtIn = direction === 'out_gt_in';
        const options: { index: RebalanceOptionIndex; label: string }[] = outGtIn
          ? [
              { index: 0, label: 'Divide among all players equally' },
              { index: 1, label: 'Divide among winners equally' },
              { index: 2, label: 'Divide among winners proportionally' },
              { index: 3, label: 'Do not rebalance' },
            ]
          : [
              { index: 0, label: 'Divide among all players equally' },
              { index: 1, label: 'Divide among losers equally' },
              { index: 2, label: 'Divide among losers proportionally' },
              { index: 3, label: 'Do not rebalance' },
            ];
        return (
          <div
            className="modal active"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rebalance-modal-title"
          >
            <div className="modal-overlay" onClick={() => setRebalanceModalOpen(false)} />
            <div className="modal-content" role="document">
              <div className="modal-header">
                <h2 id="rebalance-modal-title" className="modal-title">
                  Session unbalanced
                </h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setRebalanceModalOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p className="muted-text" style={{ marginBottom: '1rem' }}>
                  {outGtIn
                    ? `Out exceeds In by ${fmtOptionalDecimals(diff)} ${calc.currency}. Rebalance?`
                    : `In exceeds Out by ${fmtOptionalDecimals(diff)} ${calc.currency}. Rebalance?`}
                </p>
                <div className="flex flex-col gap-2">
                  {options.map((opt) => (
                    <button
                      key={opt.index}
                      type="button"
                      className="btn btn-secondary w-full text-left"
                      onClick={() => handleRebalanceConfirm(opt.index)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* New session: reset table confirmation modal */}
      {resetTableConfirmOpen && (
        <div
          className="modal active"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-table-confirm-title"
        >
          <div
            className="modal-overlay"
            onClick={() => setResetTableConfirmOpen(false)}
          />
          <div className="modal-content" role="document">
            <div className="modal-header">
              <h2 id="reset-table-confirm-title" className="modal-title">
                New session
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setResetTableConfirmOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="muted-text" style={{ marginBottom: '1rem' }}>
                This will reset the table. Continue?
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
                  onClick={() => setResetTableConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setResetTableConfirmOpen(false);
                    proceedNewSession();
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  onClick={() => setEndSessionModalOpen(false)}
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

      {/* Usual Suspects modal: checkboxes to choose which players appear in the table */}
      {usualSuspectsModalOpen && (
        <div
          className="modal active"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usual-suspects-title"
        >
          <div
            className="modal-overlay"
            onClick={() => setUsualSuspectsModalOpen(false)}
          />
          <div className="modal-content" role="document">
            <div className="modal-header">
              <h2 id="usual-suspects-title" className="modal-title">
                Usual suspects
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setUsualSuspectsModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {calc.allSuspects.length === 0 ? (
                <p className="muted-text">
                  No players listed. Select a group (New session).
                </p>
              ) : (
                <ul className="usual-suspects-modal-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {calc.allSuspects.map((name) => (
                    <li key={name} style={{ marginBottom: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={suspectsChecked.has(name)}
                          onChange={(e) => {
                            setSuspectsChecked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(name);
                              else next.delete(name);
                              return next;
                            });
                          }}
                        />
                        <span>{name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                  marginTop: '1rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setUsualSuspectsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={calc.allSuspects.length === 0 || suspectsChecked.size === 0}
                  onClick={() => {
                    const ordered = calc.allSuspects.filter((n) =>
                      suspectsChecked.has(n)
                    );
                    calc.setRowsFromSelectedNames(ordered, calc.allSuspects);
                    setUsualSuspectsModalOpen(false);
                  }}
                >
                  Apply
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
