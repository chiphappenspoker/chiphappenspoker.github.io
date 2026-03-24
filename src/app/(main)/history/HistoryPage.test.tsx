import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryPage from './page';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';
import { useGameHistory } from '@/hooks/useGameHistory';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
const mockGet = vi.fn((key: string) => (key === 'sessionId' ? null : null));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useGroups', () => ({ useGroups: vi.fn() }));
vi.mock('@/hooks/useGameHistory', () => ({ useGameHistory: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/lib/entitlements/EntitlementsProvider', () => ({
  useEntitlements: () => ({
    tier: 'pro' as const,
    flags: {
      canUnlimitedSessions: true,
      canLifetimeStats: true,
      canPlayerInsights: true,
      canCrossSessionLeaderboard: true,
      canGroups: true,
      canProfitOverTime: true,
      canExport: true,
    },
    loading: false,
    proUnlockedAt: '2026-01-01T00:00:00Z',
    notificationPrefs: { groupInvite: true, sessionSettled: true, settlementReminder: true },
    setNotificationPrefs: vi.fn(),
    refresh: vi.fn(),
    upgradeModalOpen: false,
    openUpgradeModal: vi.fn(),
    closeUpgradeModal: vi.fn(),
  }),
}));
vi.mock('@/components/layout/NavMenu', () => ({
  NavMenu: () => <nav data-testid="nav-menu">NavMenu</nav>,
}));
vi.mock('./SessionDetailContent', () => ({
  SessionDetailContent: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-detail">
      <h1 className="page-title">Session details</h1>
      <a href="/history">Back to history</a>
    </div>
  ),
}));

describe('HistoryPage', () => {
  beforeEach(() => {
    mockGet.mockImplementation((key: string) => (key === 'sessionId' ? null : null));
    vi.mocked(useGroups).mockReturnValue({ groups: [], loading: false, reload: vi.fn() });
    vi.mocked(useGameHistory).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      filters: { groupId: null, fromDate: '', toDate: '' },
      setFilters: vi.fn(),
      reload: vi.fn(),
    });
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
  });

  it('shows sign-in message when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    render(<HistoryPage />);
    expect(screen.getByText(/sign in to see history/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to calculator/i })).toHaveAttribute('href', '/');
  });

  it('shows loading when auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    render(<HistoryPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows History title and filters when user is signed in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    render(<HistoryPage />);
    expect(screen.getByRole('heading', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByText(/all groups/i)).toBeInTheDocument();
    expect(screen.getByText(/no sessions found\./i)).toBeInTheDocument();
  });

  it('shows session list when sessions are returned', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useGameHistory).mockReturnValue({
      sessions: [
        {
          id: 's1',
          session_date: '2026-03-01',
          group_id: null,
          currency: 'EUR',
          created_by: 'u1',
          default_buy_in: '30',
          settlement_mode: 'greedy',
          status: 'settled',
          share_code: '',
          created_at: '',
          updated_at: '',
        },
      ],
      loading: false,
      error: null,
      filters: { groupId: null, fromDate: '', toDate: '' },
      setFilters: vi.fn(),
      reload: vi.fn(),
    });
    render(<HistoryPage />);
    expect(screen.getByRole('link', { name: /no group · eur/i })).toHaveAttribute('href', '/history?sessionId=s1');
  });

  it('displays session detail view when sessionId is in URL', () => {
    mockGet.mockImplementation((key: string) => (key === 'sessionId' ? 's1' : null));
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    render(<HistoryPage />);
    expect(screen.getByTestId('session-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /session details/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to history/i })).toHaveAttribute('href', '/history');
  });
});
