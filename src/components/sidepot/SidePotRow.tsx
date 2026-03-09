'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { parseNum } from '@/lib/calc/formatting';

const SWIPE_DELETE_THRESHOLD = 100;

interface SidePotRowProps {
  name: string;
  bet: string;
  won: number;
  onUpdateName: (v: string) => void;
  onUpdateBet: (v: string) => void;
  onDelete: () => void;
}

export function SidePotRow({
  name,
  bet,
  won,
  onUpdateName,
  onUpdateBet,
  onDelete,
}: SidePotRowProps) {
  const betVal = parseNum(bet);
  const wonStr = (Math.round(won * 100) / 100).toFixed(2).replace('-0.00', '0.00');

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (touchStartXRef.current == null) return;
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
    <tr>
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
          <div className="name-cell-wrapper">
            <input
              className="input-field name-input"
              type="text"
              placeholder="Player"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={name}
              onChange={(e) => onUpdateName(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
        </div>
        </div>
      </td>
      <td>
        <input
          className={`input-field num-input${betVal === 0 ? ' zero-value' : ''}`}
          type="text"
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          value={bet}
          onChange={(e) => onUpdateBet(e.target.value)}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
      </td>
      <td className="payout">{wonStr}</td>
    </tr>
  );
}
