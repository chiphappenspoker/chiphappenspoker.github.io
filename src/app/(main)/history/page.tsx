'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';
import { useGameHistory } from '@/hooks/useGameHistory';
import { NavMenu } from '@/components/layout/NavMenu';
import { SessionDetailContent } from './SessionDetailContent';

function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

export default function HistoryPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';
  const { user, loading: authLoading } = useAuth();
  const { groups } = useGroups();
  const { sessions, loading, error, filters, setFilters, reload } = useGameHistory();

  const getGroupName = (groupId: string | null): string => {
    if (!groupId) return 'No group';
    const g = groups.find((x) => x.id === groupId);
    return g?.name ?? groupId;
  };

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
        <h1 className="page-title">History</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">Sign in to see history.</p>
            <Link href="/" className="btn btn-primary">
              Go to calculator
            </Link>
            <p className="mt-4">
              <Link href="/" className="text-sm muted-text underline">
                Settings
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (sessionId) {
    return <SessionDetailContent sessionId={sessionId} />;
  }

  return (
    <div className="wrap">
      <h1 className="page-title">History</h1>
      <div className="card">
        <div className="toolbar">
          <NavMenu activePage="history" />
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
                value={filters.groupId ?? ''}
                onChange={(e) => setFilters({ groupId: e.target.value || null })}
              >
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="settings-field block">
                <span className="settings-label">From date</span>
                <input
                  className="input-field w-full"
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => setFilters({ fromDate: e.target.value })}
                />
              </label>
              <label className="settings-field block">
                <span className="settings-label">To date</span>
                <input
                  className="input-field w-full"
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => setFilters({ toDate: e.target.value })}
                />
              </label>
            </div>
            <button type="button" className="btn btn-secondary" onClick={reload} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}

          {loading && sessions.length === 0 ? (
            <p className="muted-text">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="muted-text">No sessions found.</p>
          ) : (
            <div className="settings-list">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/history?sessionId=${session.id}`}
                  className="settings-item-btn w-full text-left flex flex-col items-stretch no-underline text-inherit"
                >
                  <span className="font-medium">{formatSessionDate(session.session_date)}</span>
                  <span className="settings-item-meta">
                    {getGroupName(session.group_id)} · {session.currency}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
