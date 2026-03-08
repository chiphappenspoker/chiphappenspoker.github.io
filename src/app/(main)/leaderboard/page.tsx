'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';
import { getGroupLeaderboard } from '@/lib/data/stats';
import { fmt } from '@/lib/calc/formatting';
import { useEffect, useState } from 'react';
import type { LeaderboardRow } from '@/lib/types';
import { NavMenu } from '@/components/layout/NavMenu';

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

export default function LeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { groups } = useGroups();
  const [groupId, setGroupId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('all');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { fromDate, toDate } = getDateRange(period);

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

  return (
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
                onChange={(e) => setGroupId(e.target.value)}
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
            <div className="table-wrap">
              <table className="page-payout-table">
                <thead>
                  <tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Name</th>
                    <th className="text-right">Profit</th>
                    <th className="text-right">Sessions</th>
                    <th className="text-right">W</th>
                    <th className="text-right">L</th>
                    <th className="text-right">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .sort((a, b) => b.total_profit - a.total_profit)
                    .map((row, index) => (
                      <tr key={row.user_id}>
                        <td>{index + 1}</td>
                        <td>{row.display_name || '—'}</td>
                        <td className="text-right font-mono tabular-nums">
                          {fmt(row.total_profit)}
                          {currency ? ` ${currency}` : ''}
                        </td>
                        <td className="text-right">{row.total_sessions}</td>
                        <td className="text-right">{row.win_count}</td>
                        <td className="text-right">{row.loss_count}</td>
                        <td className="text-right font-mono tabular-nums">{fmt(winRate(row))}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
