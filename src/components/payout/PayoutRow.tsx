'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { parseNum, fmtOptionalDecimals } from '@/lib/calc/formatting';

const SWIPE_DELETE_THRESHOLD = 100;

interface PayoutRowProps {
  name: string;
  buyIn: string;
  cashOut: string;
  settled: boolean;
  payout: number;
  checkboxesVisible: boolean;
  tableLocked: boolean;
  onUpdateName: (v: string) => void;
  onUpdateBuyIn: (v: string) => void;
  onUpdateCashOut: (v: string) => void;
  onUpdateSettled: (v: boolean) => void;
  onAdjust: (delta: number) => void;
  onDelete: () => void;
}

export function PayoutRow({
  name,
  buyIn,
  cashOut,
  settled,
  payout,
  checkboxesVisible,
  tableLocked,
  onUpdateName,
  onUpdateBuyIn,
  onUpdateCashOut,
  onUpdateSettled,
  onAdjust,
  onDelete,
}: PayoutRowProps) {
  const inVal = parseNum(buyIn);
  const outVal = parseNum(cashOut);
  const payoutStr = fmtOptionalDecimals(payout);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (tableLocked) return;
    touchStartXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (tableLocked || touchStartXRef.current == null) return;
    const x = e.touches[0].clientX;
    const dx = x - touchStartXRef.current;
    if (dx < 0) e.preventDefault();
    setSwipeOffset(Math.min(0, dx));
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (touchStartXRef.current == null) return;
    if (swipeOffset <= -SWIPE_DELETE_THRESHOLD) {
      onDelete();
    }
    setIsDragging(false);
    setSwipeOffset(0);
    touchStartXRef.current = null;
  };

  return (
    <tr className={tableLocked ? 'row-locked' : ''}>
      <td className="swipe-cell">
        <div className="swipe-wrapper">
          <div className="swipe-reveal" aria-hidden="true">
            <span className="swipe-reveal-label">Delete</span>
          </div>
          <div
            className="swipe-content"
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className={`name-cell-wrapper${
              !checkboxesVisible ? ' hidden-checkboxes' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={settled}
              title="Settled"
              onChange={(e) => onUpdateSettled(e.target.checked)}
            />
            <input
              className="input-field name-input"
              type="text"
              placeholder="Player"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={name}
              disabled={tableLocked}
              onChange={(e) => onUpdateName(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
        </div>
        </div>
      </td>
      <td className="step-cell minus-cell">
        <button
          type="button"
          className="step-btn minus"
          title="Subtract buy-in"
          aria-label="Subtract buy-in"
          disabled={tableLocked}
          onClick={() => onAdjust(-1)}
        >
          −
        </button>
      </td>
      <td>
        <input
          className={`input-field num-input${inVal === 0 ? ' zero-value' : ''}`}
          type="text"
          placeholder="0"
          inputMode="numeric"
          autoComplete="off"
          value={buyIn}
          disabled={tableLocked}
          onChange={(e) => onUpdateBuyIn(e.target.value)}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
      </td>
      <td className="step-cell plus-cell">
        <button
          type="button"
          className="step-btn plus"
          title="Add buy-in"
          aria-label="Add buy-in"
          disabled={tableLocked}
          onClick={() => onAdjust(1)}
        >
          +
        </button>
      </td>
      <td>
        <input
          className={`input-field num-input${outVal === 0 ? ' zero-value' : ''}`}
          type="text"
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          value={cashOut}
          disabled={tableLocked}
          onChange={(e) => onUpdateCashOut(e.target.value)}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
      </td>
      <td className="payout">{payoutStr}</td>
    </tr>
  );
}
