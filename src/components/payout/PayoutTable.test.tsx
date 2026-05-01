import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PayoutTable } from './PayoutTable';

const mockSetOpenSelectGroupModal = vi.fn();
const mockSetGroupSelectedCallback = vi.fn();
const mockClearGroupSelectedCallback = vi.fn();

const mockCalcBase = {
  initialized: true,
  isBalanced: true,
  totalIn: 0,
  totalOut: 0,
  payouts: [],
  rows: [],
  buyIn: '30',
  currency: 'EUR',
  groupsLoading: false,
  selectedGroup: { id: 'g1', name: 'Friday', created_by: 'u1', created_at: '', updated_at: '' },
  selectedGroupId: 'g1' as string | null,
  setSelectedGroupId: vi.fn(),
  settlementMode: 'greedy' as const,
  transactions: [],
  usualSuspectsForSettlement: [],
  allSuspects: [],
  currentSessionId: null as string | null,
  clearTable: vi.fn(),
  setSavedSession: vi.fn(),
  addRow: vi.fn(),
  updateRow: vi.fn(),
  adjustBuyIn: vi.fn(),
  removeRow: vi.fn(),
  setBuyIn: vi.fn(),
  getPlayerNames: vi.fn(() => []),
  getShareUrl: vi.fn(async () => 'https://example.com/share'),
  setRowsFromSelectedNames: vi.fn(),
};

const mockUsePayoutCalculator = vi.fn(() => mockCalcBase);

vi.mock('@/hooks/usePayoutCalculator', () => ({
  usePayoutCalculator: () => mockUsePayoutCalculator(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/hooks/useSelectGroupModal', () => ({
  useSelectGroupModal: () => ({
    openSelectGroupModal: false,
    setOpenSelectGroupModal: mockSetOpenSelectGroupModal,
    setGroupSelectedCallback: mockSetGroupSelectedCallback,
    clearGroupSelectedCallback: mockClearGroupSelectedCallback,
  }),
}));
vi.mock('@/components/layout/NavMenu', () => ({
  NavMenu: () => <nav data-testid="nav-menu">Nav</nav>,
}));
vi.mock('@/lib/data/sync-repository', () => ({
  getRepository: vi.fn(),
}));
vi.mock('@/lib/sync/sync-queue', () => ({
  clearQueueEntriesForSession: vi.fn(async () => undefined),
}));

describe('PayoutTable new session group picker behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePayoutCalculator.mockReturnValue({
      ...mockCalcBase,
      clearTable: vi.fn(),
    });
  });

  it('does not open SelectGroupModal when selectedGroupId already exists', async () => {
    render(<PayoutTable />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /new session/i }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockCalcBase.setSelectedGroupId).toHaveBeenCalledWith('g1');
    });
    expect(mockSetOpenSelectGroupModal).not.toHaveBeenCalled();
    expect(mockSetGroupSelectedCallback).not.toHaveBeenCalled();
  });

  it('opens SelectGroupModal when no selectedGroupId exists', async () => {
    mockUsePayoutCalculator.mockReturnValue({
      ...mockCalcBase,
      selectedGroupId: null,
      selectedGroup: null,
      clearTable: vi.fn(),
    });

    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /new session/i }));

    await waitFor(() => {
      expect(mockSetOpenSelectGroupModal).toHaveBeenCalledWith(true);
    });
  });
});

describe('PayoutTable session status messaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePayoutCalculator.mockReturnValue({
      ...mockCalcBase,
      rows: [{ id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false }],
      clearTable: vi.fn(),
    });
  });

  it('renders a dominant end session button and shows upload status in summary card', () => {
    render(<PayoutTable />);

    const endSessionButton = screen.getByRole('button', { name: /end session/i });
    expect(endSessionButton.className).toContain('btn-end-session-dominant');
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Not uploaded')).toBeInTheDocument();
  });

  it('keeps end session disabled when table is untouched', () => {
    mockUsePayoutCalculator.mockReturnValue({
      ...mockCalcBase,
      rows: [
        { id: 'r1', name: '', buyIn: '30', cashOut: '', paid: false, settled: false },
        { id: 'r2', name: '', buyIn: '30', cashOut: '', paid: false, settled: false },
      ],
      buyIn: '30',
      clearTable: vi.fn(),
    });
    render(<PayoutTable />);

    expect(screen.getByRole('button', { name: /end session/i })).toBeDisabled();
  });

  it('shows Pro-only modal when ending an Ad Hoc session', () => {
    mockUsePayoutCalculator.mockReturnValue({
      ...mockCalcBase,
      selectedGroupId: null,
      selectedGroup: null,
      rows: [
        { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false },
      ],
      clearTable: vi.fn(),
    });

    render(<PayoutTable />);

    const endBtn = screen.getByRole('button', { name: /end session/i });
    expect(endBtn).not.toBeDisabled();
    fireEvent.click(endBtn);

    expect(screen.getByRole('dialog', { name: /pro feature/i })).toBeInTheDocument();
    expect(screen.getByText(/Ending and saving a session is available in Pro only/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(screen.queryByRole('dialog', { name: /pro feature/i })).not.toBeInTheDocument();
  });

  it('shows Pro-only modal when signed out but localStorage still has a stale group id (UI shows Ad Hoc)', () => {
    mockUsePayoutCalculator.mockReturnValue({
      ...mockCalcBase,
      selectedGroupId: 'persisted-from-last-login',
      selectedGroup: null,
      rows: [
        { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false },
      ],
      clearTable: vi.fn(),
    });

    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    expect(screen.getByRole('dialog', { name: /pro feature/i })).toBeInTheDocument();
    expect(screen.getByText(/Pro only/i)).toBeInTheDocument();
  });
});
