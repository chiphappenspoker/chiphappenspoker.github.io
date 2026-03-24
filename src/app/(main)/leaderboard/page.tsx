'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';
import { getGroupLeaderboard } from '@/lib/data/stats';
import { fmt } from '@/lib/calc/formatting';
import { formatLeaderboardRank } from '@/lib/calc/leaderboard-rank';
import { useEffect, useRef, useState } from 'react';
import type { LeaderboardRow } from '@/lib/types';
import { NavMenu } from '@/components/layout/NavMenu';
import { ProFeatureGate } from '@/components/entitlements/ProFeatureGate';
import { getLocalStorage, setLocalStorage } from '@/lib/storage/local-storage';
import { PAYOUT_STORAGE_KEY, SELECTED_GROUP_CHANGED_EVENT } from '@/lib/constants';

type Period = 'all' | '30' | '90' | 'year';

function getDateRange(period: Period): { fromDate?: string; toDate?: string } {
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  if (period === 'all') return {};
  if (period === '30') {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return { fromDate: from.toISOString().slice(0, 10), toDate };
  }
  if (period === '90') {
    const from = new Date(today);
    from.setDate(from.getDate() - 90);
    return { fromDate: from.toISOString().slice(0, 10), toDate };
  }
  // year
  const fromDate = `${today.getFullYear()}-01-01`;
  return { fromDate, toDate };
}

function winRate(row: LeaderboardRow): number {
  if (row.total_sessions <= 0) return 0;
  return (row.win_count / row.total_sessions) * 100;
}

type CategoryId = 'total_pnl' | 'pnl_per_session' | 'largest_pnl' | 'sessions' | 'win_rate';

const LEADERBOARD_CATEGORIES: Array<{
  id: CategoryId;
  label: string;
  filter: (row: LeaderboardRow) => boolean;
  sort: (a: LeaderboardRow, b: LeaderboardRow) => number;
}> = [
  {
    id: 'total_pnl',
    label: 'Total PnL',
    filter: (r) => r.total_profit > 0,
    sort: (a, b) => b.total_profit - a.total_profit,
  },
  {
    id: 'pnl_per_session',
    label: 'PnL per session',
    filter: (r) => r.avg_profit > 0,
    sort: (a, b) => b.avg_profit - a.avg_profit,
  },
  {
    id: 'largest_pnl',
    label: 'Largest PnL (single session)',
    filter: (r) => r.max_session_profit > 0,
    sort: (a, b) => b.max_session_profit - a.max_session_profit,
  },
  {
    id: 'sessions',
    label: '# of Sessions',
    filter: (r) => r.total_sessions >= 1,
    sort: (a, b) => b.total_sessions - a.total_sessions,
  },
  {
    id: 'win_rate',
    label: 'Win rate',
    filter: (r) => winRate(r) > 0,
    sort: (a, b) => winRate(b) - winRate(a),
  },
];

function getRowsForCategory(rows: LeaderboardRow[], categoryId: CategoryId): LeaderboardRow[] {
  const cat = LEADERBOARD_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return [];
  return rows.filter(cat.filter).slice().sort(cat.sort);
}

export default function LeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { groups } = useGroups();
  const [groupId, setGroupId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('all');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const touchStartXRef = useRef<number>(0);

  const { fromDate, toDate } = getDateRange(period);

  // Initialize group from payout calculator's persisted selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = getLocalStorage<{ selectedGroupId?: string }>(PAYOUT_STORAGE_KEY);
    const id = saved?.selectedGroupId ?? '';
    if (id) setGroupId(id);
  }, []);

  // Sync when group is changed elsewhere (e.g. SelectGroupModal)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ selectedGroupId: string | null }>).detail;
      if (detail && 'selectedGroupId' in detail) {
        setGroupId(detail.selectedGroupId ?? '');
      }
    };
    window.addEventListener(SELECTED_GROUP_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SELECTED_GROUP_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!user || !groupId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGroupLeaderboard(groupId, fromDate, toDate)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load leaderboard');
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, groupId, fromDate, toDate]);

  if (authLoading) {
    return (
      <div className="wrap">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted-text">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wrap">
        <h1 className="page-title">Leaderboard</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">Sign in to see leaderboard.</p>
            <Link href="/" className="btn btn-primary">
              Go to calculator
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const selectedGroup = groups.find((g) => g.id === groupId);
  const currency = selectedGroup?.currency ?? '';
  const currentCategory = LEADERBOARD_CATEGORIES[categoryIndex];
  const displayRows = currentCategory ? getRowsForCategory(rows, currentCategory.id) : [];

  return (
    <ProFeatureGate
      layout="cardWithNav"
      navActivePage="leaderboard"
      feature="canCrossSessionLeaderboard"
      title="Leaderboard"
      description="Group leaderboards across sessions are part of ChipHappens Pro (one-time unlock)."
    >
    <div className="wrap">
      <h1 className="page-title">Leaderboard</h1>
      <div className="card">
        <div className="toolbar">
          <NavMenu activePage="leaderboard" />
          <span className="toolbar-icon" aria-hidden="true" title="Poker">
            <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img">
              <title>Spade</title>
              <path fill="#d4a832" d="M32 6C20 18 8 26 8 36c0 6 5 11 11 11 4 0 8-2 10-5-1 5-3 9-8 12h22c-5-3-7-7-8-12 2 3 6 5 10 5 6 0 11-5 11-11 0-10-12-18-24-30z" />
            </svg>
          </span>
          <span className="spacer" />
        </div>
        <div className="card-content">
          <div className="space-y-3 mb-6">
            <label className="settings-field block">
              <span className="settings-label">Group</span>
              <select
                className="input-field w-full"
                value={groupId}
                onChange={(e) => {
                  const value = e.target.value;
                  setGroupId(value);
                  const existing = getLocalStorage<Record<string, unknown>>(PAYOUT_STORAGE_KEY);
                  const next = existing
                    ? { ...existing, selectedGroupId: value || undefined }
                    : { selectedGroupId: value || undefined };
                  setLocalStorage(PAYOUT_STORAGE_KEY, next);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent(SELECTED_GROUP_CHANGED_EVENT, {
                        detail: { selectedGroupId: value || null },
                      })
                    );
                  }
                }}
              >
                <option value="">Select a group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field block">
              <span className="settings-label">Time period</span>
              <select
                className="input-field w-full"
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
              >
                <option value="all">All time</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="year">This year</option>
              </select>
            </label>
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {!groupId ? (
            <p className="muted-text">Select a group to see the leaderboard.</p>
          ) : loading && rows.length === 0 ? (
            <p className="muted-text">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="muted-text">No data for this group and period.</p>
          ) : (
            <div className="leaderboard-carousel" role="region" aria-label="Leaderboard by category">
              <div
                className="leaderboard-carousel-header"
                onTouchStart={(e) => {
                  touchStartXRef.current = e.touches[0]?.clientX ?? 0;
                }}
                onTouchEnd={(e) => {
                  const startX = touchStartXRef.current;
                  const endX = e.changedTouches[0]?.clientX ?? startX;
                  const deltaX = endX - startX;
                  if (deltaX < -50) setCategoryIndex((i) => (i + 1) % 5);
                  if (deltaX > 50) setCategoryIndex((i) => (i - 1 + 5) % 5);
                }}
              >
                <button
                  type="button"
                  className="leaderboard-arrow"
                  aria-label="Previous category"
                  onClick={() => setCategoryIndex((i) => (i - 1 + 5) % 5)}
                >
                  ‹
                </button>
                <span className="leaderboard-category-title">
                  {currentCategory?.label ?? ''}
                </span>
                <button
                  type="button"
                  className="leaderboard-arrow"
                  aria-label="Next category"
                  onClick={() => setCategoryIndex((i) => (i + 1) % 5)}
                >
                  ›
                </button>
              </div>
              <div className="leaderboard-dots" role="tablist" aria-label="Leaderboard category">
                {LEADERBOARD_CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={i === categoryIndex}
                    aria-label={i === categoryIndex ? cat.label : `Go to ${cat.label}`}
                    className={`leaderboard-dot ${i === categoryIndex ? 'leaderboard-dot-active' : ''}`}
                    onClick={() => setCategoryIndex(i)}
                  />
                ))}
              </div>
              <div className="leaderboard-table-wrap">
                  {displayRows.length === 0 ? (
                    <p className="muted-text">
                      {currentCategory?.id === 'sessions'
                        ? 'No sessions in this period.'
                        : `No players with positive ${currentCategory?.label ?? 'metric'} in this period.`}
                    </p>
                  ) : (
                    <div className="table-wrap">
              <table className="page-payout-table">
                <thead>
                  <tr>
                    <th className="text-left">Rank</th>
                    <th className="text-left">Name</th>
                    <th className="text-right">
                      {currentCategory?.id === 'total_pnl' && 'Profit'}
                      {currentCategory?.id === 'pnl_per_session' && 'Avg/session'}
                      {currentCategory?.id === 'largest_pnl' && 'Largest session'}
                      {currentCategory?.id === 'sessions' && 'Sessions'}
                      {currentCategory?.id === 'win_rate' && 'Win %'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, index) => (
                    <tr key={row.user_id}>
                      <td>{formatLeaderboardRank(index + 1)}</td>
                      <td>{row.display_name || '—'}</td>
                      <td className="text-right tabular-nums">
                        {currentCategory?.id === 'total_pnl' &&
                          `${fmt(row.total_profit)}${currency ? ` ${currency}` : ''}`}
                        {currentCategory?.id === 'pnl_per_session' &&
                          `${fmt(row.avg_profit)}${currency ? ` ${currency}` : ''}`}
                        {currentCategory?.id === 'largest_pnl' &&
                          `${fmt(row.max_session_profit)}${currency ? ` ${currency}` : ''}`}
                        {currentCategory?.id === 'sessions' && row.total_sessions}
                        {currentCategory?.id === 'win_rate' && `${fmt(winRate(row))}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </ProFeatureGate>
  );
}
