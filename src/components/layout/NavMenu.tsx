'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSettings } from '@/hooks/useSettings';

interface NavMenuProps {
  activePage?: 'payout' | 'sidepot' | 'history' | 'leaderboard' | 'stats';
  playerNames?: string[];
}

export function NavMenu({ activePage = 'payout', playerNames = [] }: NavMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { openSettingsModal } = useSettings();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const sidePotHref = playerNames.length > 0
    ? `/side-pot?names=${playerNames.join(',')}`
    : '/side-pot';

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        className="menu-btn"
        aria-label="Menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <div className="menu-dropdown active">
          <Link href="/" onClick={() => setOpen(false)}>
            Payout Calculator
          </Link>
          <Link href={sidePotHref} onClick={() => setOpen(false)}>
            Side Pot Calculator
          </Link>
          <Link href="/history" onClick={() => setOpen(false)}>
            History
          </Link>
          <Link href="/leaderboard" onClick={() => setOpen(false)}>
            Leaderboard
          </Link>
          <Link href="/stats" onClick={() => setOpen(false)}>
            Stats
          </Link>
          <button
            className="menu-link"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              openSettingsModal();
            }}
          >
            Settings
          </button>
        </div>
      )}
    </div>
  );
}
