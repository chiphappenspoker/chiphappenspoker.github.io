'use client';

import { useState, useRef, useEffect } from 'react';
import { useSidePotCalculator } from '@/hooks/useSidePotCalculator';
import { NavMenu } from '@/components/layout/NavMenu';
import { SidePotRow } from './SidePotRow';
import { PotDisplay } from './PotDisplay';
import { useToast } from '@/hooks/useToast';
import { fmt, fmtInt, parseNum } from '@/lib/calc/formatting';

export function SidePotTable() {
  const calc = useSidePotCalculator();
  const { showToast } = useToast();
  const [usualSuspectsModalOpen, setUsualSuspectsModalOpen] = useState(false);
  const [suspectsChecked, setSuspectsChecked] = useState<Set<string>>(new Set());

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
        const html = `<a href="${url}">Side Pot Share</a>`;
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
        try {
          const textarea = document.createElement('textarea');
          textarea.value = url;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(textarea);
          showToast(
            ok ? 'Share link copied to clipboard!' : 'Failed to copy link'
          );
        } catch {
          showToast('Failed to copy link');
        }
      }
    } catch {
      showToast('Error copying share link');
    }
  };

  const initialPotVal = parseNum(calc.initialPot);

  return (
    <div className="wrap">
      <h1 className="page-title">Side Pot Calculator</h1>
      <div className="card">
        {/* Toolbar */}
        <div className="toolbar">
          <NavMenu activePage="sidepot" />
          <span className="toolbar-icon" aria-hidden="true" title="Poker">
            <svg
              width="22"
              height="22"
              viewBox="0 0 64 64"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
            >
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

        {/* Boards card (above table): group info + boards selection */}
        <div className="boards-card card">
          <div className="card-content boards-card-content">
            <div className="buyin-card-main">
              <span className="buyin-card-main-label">Group</span>
              <span className="buyin-card-main-value">
                {calc.selectedGroup ? calc.selectedGroup.name : 'No group'}
              </span>
            </div>
            <div className="boards-card-sub">
              <label className="boards-card-label" htmlFor="boardsSelect">
                Boards
              </label>
              <select
                id="boardsSelect"
                className="select-field boards-select"
                value={calc.boards}
                onChange={(e) => calc.setBoards(Number(e.target.value))}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <form onSubmit={(e) => e.preventDefault()}>
            <table className="page-sidepot-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-bet" />
                <col className="col-won" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Bet</th>
                  <th>Won</th>
                </tr>
              </thead>
              <tbody>
                {/* Player Rows */}
                {calc.rows.map((row, i) => (
                  <SidePotRow
                    key={row.id}
                    name={row.name}
                    bet={row.bet}
                    won={calc.playerWinnings[row.name.trim()] ?? 0}
                    onUpdateName={(v) => calc.updateRow(i, 'name', v)}
                    onUpdateBet={(v) => calc.updateRow(i, 'bet', v)}
                    onDelete={() => calc.removeRow(i)}
                  />
                ))}
                {/* Initial Pot Row (bottom of table) */}
                <tr className="initial-pot-row">
                  <td className="initial-pot-label">Initial Pot</td>
                  <td>
                    <input
                      className={`input-field num-input${
                        initialPotVal === 0 ? ' zero-value' : ''
                      }`}
                      type="text"
                      placeholder="0.00"
                      inputMode="decimal"
                      autoComplete="off"
                      value={calc.initialPot}
                      onChange={(e) => calc.setInitialPot(e.target.value)}
                      onClick={(e) =>
                        (e.target as HTMLInputElement).select()
                      }
                    />
                  </td>
                  <td className="payout">&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </form>
        </div>

        {/* Pot Display */}
        <PotDisplay
          pots={calc.pots}
          boards={calc.boards}
          winnerSelections={calc.winnerSelections}
          onToggleWinner={calc.toggleWinner}
        />

        {/* Action Row */}
        <div className="action-row">
          <div className="action-buttons">
            <button
              className="btn btn-secondary btn-session-action btn-icon-only"
              type="button"
              onClick={() => calc.addRow()}
              disabled={calc.rows.length >= 32}
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
              onClick={calc.clearTable}
              aria-label="Clear table"
            >
              <span aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </span>
            </button>
          </div>

          </div>

        {/* Summary card: Total pot, Status, Total bet/won, Difference, Players (at bottom) */}
        {(() => {
          const imbalance = calc.totalWon - calc.totalBet;
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
                  <span className="payout-summary-main-value">{fmt(calc.totalBet)}</span>
                </div>
                <div className="payout-summary-sub">
                  <div className="payout-summary-item">
                    <span className="payout-summary-label">Total bet</span>
                    <span className="payout-summary-value">{fmt(calc.totalBet)}</span>
                  </div>
                  <div className="payout-summary-item">
                    <span className="payout-summary-label">Total won</span>
                    <span className="payout-summary-value">{fmt(calc.totalWon)}</span>
                  </div>
                  {!calc.isBalanced && (
                    <div className="payout-summary-item">
                      <span className="payout-summary-label">Difference</span>
                      <span
                        className="payout-summary-value payout-summary-difference"
                        title="|Total won − Total bet|"
                      >
                        {imbalanceSign}{fmt(imbalanceAbs)}
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
                  No players listed. Select a group on the Payout page (New
                  session).
                </p>
              ) : (
                <ul
                  className="usual-suspects-modal-list"
                  style={{ listStyle: 'none', padding: 0, margin: 0 }}
                >
                  {calc.allSuspects.map((name) => (
                    <li key={name} style={{ marginBottom: '0.5rem' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                        }}
                      >
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
                  disabled={
                    calc.allSuspects.length === 0 || suspectsChecked.size === 0
                  }
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
