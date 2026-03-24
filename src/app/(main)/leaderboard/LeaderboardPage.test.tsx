import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeaderboardPage from './page';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';
import { getGroupLeaderboard } from '@/lib/data/stats';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useGroups', () => ({ useGroups: vi.fn() }));
vi.mock('@/lib/data/stats', () => ({ getGroupLeaderboard: vi.fn() }));
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
vi.mock('@/lib/storage/local-storage', () => ({
  getLocalStorage: vi.fn(() => null),
  setLocalStorage: vi.fn(),
}));

describe('LeaderboardPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useGroups).mockReturnValue({ groups: [], loading: false, reload: vi.fn() });
    vi.mocked(getGroupLeaderboard).mockResolvedValue([]);
  });

  it('displays sign-in message when user is null', () => {
    render(<LeaderboardPage />);
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to see leaderboard/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to calculator/i })).toHaveAttribute('href', '/');
  });

  it('displays Leaderboard title and group selector when user is signed in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useGroups).mockReturnValue({
      groups: [{ id: 'g1', name: 'Poker Night', invite_code: 'x', currency: 'EUR', default_buy_in: '30', settlement_mode: 'greedy', created_by: 'u1', created_at: '', updated_at: '' }],
      loading: false,
      reload: vi.fn(),
    });
    render(<LeaderboardPage />);
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeInTheDocument();
    expect(screen.getByText(/select a group to see the leaderboard/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /group/i })).toBeInTheDocument();
  });

  it('displays leaderboard table when group selected and data loaded', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useGroups).mockReturnValue({
      groups: [{ id: 'g1', name: 'Poker Night', invite_code: 'x', currency: 'EUR', default_buy_in: '30', settlement_mode: 'greedy', created_by: 'u1', created_at: '', updated_at: '' }],
      loading: false,
      reload: vi.fn(),
    });
    vi.mocked(getGroupLeaderboard).mockResolvedValue([
      {
        user_id: 'u1',
        display_name: 'Alice',
        total_profit: 100,
        total_sessions: 5,
        win_count: 3,
        loss_count: 2,
        avg_profit: 20,
        max_session_profit: 50,
      },
    ]);
    render(<LeaderboardPage />);
    const groupSelect = screen.getByRole('combobox', { name: /group/i });
    fireEvent.change(groupSelect, { target: { value: 'g1' } });
    await waitFor(() => {
      expect(screen.getByText(/alice/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('generates leaderboard for an existing group: calls getGroupLeaderboard with group id and displays rows', async () => {
    const mockGroups = [
      { id: 'group-abc', name: 'Friday Game', invite_code: 'abc', currency: 'EUR', default_buy_in: '30', settlement_mode: 'greedy', created_by: 'u1', created_at: '', updated_at: '' },
    ];
    const mockRows = [
      {
        user_id: 'u1',
        display_name: 'Alice',
        total_profit: 150.5,
        total_sessions: 10,
        win_count: 6,
        loss_count: 4,
        avg_profit: 15.05,
        max_session_profit: 80,
      },
      {
        user_id: 'u2',
        display_name: 'Bob',
        total_profit: 20,
        total_sessions: 10,
        win_count: 4,
        loss_count: 6,
        avg_profit: 2,
        max_session_profit: 25,
      },
    ];
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useGroups).mockReturnValue({ groups: mockGroups, loading: false, reload: vi.fn() });
    vi.mocked(getGroupLeaderboard).mockResolvedValue(mockRows);

    render(<LeaderboardPage />);
    const groupSelect = screen.getByRole('combobox', { name: /group/i });
    fireEvent.change(groupSelect, { target: { value: 'group-abc' } });

    await waitFor(() => {
      expect(getGroupLeaderboard).toHaveBeenCalledWith('group-abc', undefined, undefined);
    });
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
