'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';
import { getPlayerStats, getCumulativePnl } from '@/lib/data/stats';
import { fmt } from '@/lib/calc/formatting';
import { useEffect, useState } from 'react';
import type { PlayerStats } from '@/lib/types';
import type { CumulativePnlPoint } from '@/lib/data/stats';
import { PnLChart } from '@/components/history/PnLChart';

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
  const fromDate = `${today.getFullYear()}-01-01`;
  return { fromDate, toDate };
}

/** Combine multiple PlayerStats rows (e.g. one per group) into one view. */
function combineStats(rows: PlayerStats[]): {
  total_sessions: number;
  total_profit: number;
  biggest_win: number;
  biggest_loss: number;
  win_count: number;
  loss_count: number;
  avg_profit: number;
  last_played: string | null;
} {
  if (rows.length === 0) {
    return {
      total_sessions: 0,
      total_profit: 0,
      biggest_win: 0,
      biggest_loss: 0,
      win_count: 0,
      loss_count: 0,
      avg_profit: 0,
      last_played: null,
    };
  }
  const total_sessions = rows.reduce((s, r) => s + r.total_sessions, 0);
  const total_profit = rows.reduce((s, r) => s + r.total_profit, 0);
  const biggest_win = Math.max(0, ...rows.map((r) => r.biggest_win));
  const biggest_loss = Math.min(0, ...rows.map((r) => r.biggest_loss));
  const win_count = rows.reduce((s, r) => s + r.win_count, 0);
  const loss_count = rows.reduce((s, r) => s + r.loss_count, 0);
  const lastPlayedStrs = rows.map((r) => r.last_played).filter(Boolean) as string[];
  const last_played =
    lastPlayedStrs.length > 0 ? lastPlayedStrs.sort().reverse()[0]! : null;
  const avg_profit = total_sessions > 0 ? total_profit / total_sessions : 0;
  return {
    total_sessions,
    total_profit,
    biggest_win,
    biggest_loss,
    win_count,
    loss_count,
    avg_profit,
    last_played,
  };
}

export default function StatsPage() {
  const { user, loading: authLoading } = useAuth();
  const { groups } = useGroups();
  const [groupId, setGroupId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('all');
  const [rows, setRows] = useState<PlayerStats[]>([]);
  const [pnlData, setPnlData] = useState<CumulativePnlPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  const { fromDate, toDate } = getDateRange(period);
  const groupIdOrUndefined = groupId === '' || groupId === 'all' ? undefined : groupId;

  useEffect(() => {
    if (!user) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPlayerStats(user.id, groupIdOrUndefined, fromDate, toDate)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, groupIdOrUndefined, fromDate, toDate]);

  useEffect(() => {
    if (!user) {
      setPnlData([]);
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    getCumulativePnl(user.id, groupIdOrUndefined ?? null, fromDate, toDate)
      .then((data) => {
        if (!cancelled) setPnlData(data);
      })
      .catch(() => {
        if (!cancelled) setPnlData([]);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, groupIdOrUndefined, fromDate, toDate]);

  if (authLoading) {
    return (
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <p className="muted-text">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <h1 className="text-xl font-semibold mb-2">Stats</h1>
          <p className="muted-text mb-4">Sign in to see your stats.</p>
          <Link href="/" className="btn btn-primary">
            Go home
          </Link>
        </main>
      </div>
    );
  }

  const combined = combineStats(rows);

  return (
    <div className="app-shell">
      <main className="app-main max-w-md mx-auto py-10 px-4">
        <h1 className="text-xl font-semibold mb-4">Your stats</h1>

        <div className="space-y-3 mb-6">
          <label className="settings-field block">
            <span className="settings-label">Group</span>
            <select
              className="input-field w-full"
              value={groupId === '' ? 'all' : groupId}
              onChange={(e) => setGroupId(e.target.value === 'all' ? '' : e.target.value)}
            >
              <option value="all">All</option>
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

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-muted)] mb-2">Cumulative profit over time</h2>
          {chartLoading && pnlData.length === 0 ? (
            <p className="muted-text">Loading chart…</p>
          ) : (
            <PnLChart data={pnlData} />
          )}
        </section>

        {loading && rows.length === 0 ? (
          <p className="muted-text">Loading…</p>
        ) : combined.total_sessions === 0 ? (
          <p className="muted-text">No sessions in this period.</p>
        ) : (
          <div className="space-y-3">
            <div className="border border-neutral-600 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="muted-text">Sessions</span>
                <span>{combined.total_sessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="muted-text">Total profit</span>
                <span>{fmt(combined.total_profit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="muted-text">Biggest win</span>
                <span>{fmt(combined.biggest_win)}</span>
              </div>
              <div className="flex justify-between">
                <span className="muted-text">Biggest loss</span>
                <span>{fmt(combined.biggest_loss)}</span>
              </div>
              <div className="flex justify-between">
                <span className="muted-text">Wins / Losses</span>
                <span>
                  {combined.win_count} / {combined.loss_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="muted-text">Avg profit per session</span>
                <span>{fmt(combined.avg_profit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="muted-text">Last played</span>
                <span>{combined.last_played ?? '—'}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
