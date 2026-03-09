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
            <table className="page-sidepot-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-bet" />
                <col className="col-won" />
              </colgroup>
              <thead>
                <tr>
                  <th className="controls-cell" colSpan={3}>
                    <div className="controls">
                      <button
                        className="btn btn-secondary btn-session-action"
                        type="button"
                        onClick={calc.clearTable}
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
                      <div className="spacer" />
                      <div className="boards-container">
                        <label className="boards-label" htmlFor="boardsSelect">
                          Boards
                        </label>
                        <select
                          id="boardsSelect"
                          className="select-field boards-select"
                          value={calc.boards}
                          onChange={(e) =>
                            calc.setBoards(Number(e.target.value))
                          }
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                        </select>
                      </div>
                    </div>
                  </th>
                </tr>
                <tr>
                  <th>Name</th>
                  <th>Bet</th>
                  <th>Won</th>
                </tr>
              </thead>
              <tbody>
                {/* Initial Pot Row */}
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
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th className="payout">{fmt(calc.totalBet)}</th>
                  <th className="payout">{fmt(calc.totalWon)}</th>
                </tr>
              </tfoot>
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
              className="btn btn-secondary btn-session-action"
              type="button"
              onClick={() => calc.addRow()}
              disabled={calc.rows.length >= 32}
            >
              ➕ Add Player
            </button>
            <button
              className="btn btn-secondary btn-session-action"
              type="button"
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
