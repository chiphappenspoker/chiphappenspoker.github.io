import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { getRepository } from '@/lib/data/sync-repository';
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

const mockShowToast = vi.fn();
const mockSaveGameSession = vi.fn();
const mockSaveGamePlayer = vi.fn();
const mockGetGroupMembersWithIds = vi.fn(async () => []);
const mockGetGamePlayers = vi.fn(async () => []);
const mockDeleteGamePlayer = vi.fn(async () => undefined);

let mockUser: { id: string } | null = null;
const signedInUser = { id: 'user-1' };

function setupSignedInCalc(overrides: Partial<typeof mockCalcBase> = {}) {
  mockUsePayoutCalculator.mockReturnValue({
    ...mockCalcBase,
    rows: [
      { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false },
    ],
    isBalanced: true,
    totalIn: 50,
    totalOut: 50,
    clearTable: vi.fn(),
    setSavedSession: vi.fn(),
    ...overrides,
  });
}

function setupRepositorySuccess() {
  vi.mocked(getRepository).mockReturnValue({
    saveGameSession: mockSaveGameSession.mockResolvedValue(undefined),
    saveGamePlayer: mockSaveGamePlayer.mockResolvedValue(undefined),
    getGroupMembersWithIds: mockGetGroupMembersWithIds,
    getGamePlayers: mockGetGamePlayers,
    deleteGamePlayer: mockDeleteGamePlayer,
  } as unknown as ReturnType<typeof getRepository>);
}

function setupRepositoryFailure() {
  vi.mocked(getRepository).mockReturnValue({
    saveGameSession: mockSaveGameSession.mockRejectedValue(new Error('network')),
    saveGamePlayer: mockSaveGamePlayer,
    getGroupMembersWithIds: mockGetGroupMembersWithIds,
    getGamePlayers: mockGetGamePlayers,
    deleteGamePlayer: mockDeleteGamePlayer,
  } as unknown as ReturnType<typeof getRepository>);
}

vi.mock('@/hooks/usePayoutCalculator', () => ({
  usePayoutCalculator: () => mockUsePayoutCalculator(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
vi.mock('./SettlementPanel', () => ({
  SettlementPanel: () => <div data-testid="settlement-panel">Settlement</div>,
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
    mockUser = null;
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
    mockUser = null;
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

describe('PayoutTable end session upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = signedInUser;
    setupSignedInCalc();
    setupRepositorySuccess();
  });

  it('opens confirm modal (not summary) when End Session is clicked', () => {
    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    expect(screen.getByRole('dialog', { name: /end session\?/i })).toBeInTheDocument();
    expect(screen.getByText(/do you want to end the session and upload/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /^end session$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('dismisses confirm on Cancel without opening summary or uploading', async () => {
    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog', { name: /end session\?/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('settlement-panel')).not.toBeInTheDocument();
    expect(mockSaveGameSession).not.toHaveBeenCalled();
  });

  it('uploads and opens summary without Save or Discard buttons', async () => {
    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    await waitFor(() => {
      expect(mockSaveGameSession).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole('dialog', { name: /end session\?/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /^end session$/i })).toBeInTheDocument();
    expect(screen.getByTestId('settlement-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith('Session saved');
  });

  it('shows Uploading… and disables buttons while saving', async () => {
    let resolveSave!: () => void;
    mockSaveGameSession.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve; })
    );

    render(<PayoutTable />);
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    expect(screen.getByRole('button', { name: /uploading/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
  });

  it('shows retry banner when upload fails but still opens summary', async () => {
    setupRepositoryFailure();

    render(<PayoutTable />);
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
    expect(screen.getByTestId('settlement-panel')).toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save session');
  });

  it('clears retry banner after successful retry', async () => {
    setupRepositoryFailure();

    render(<PayoutTable />);
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
    });

    setupRepositorySuccess();
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/upload failed/i)).not.toBeInTheDocument();
    });

    expect(mockSaveGameSession).toHaveBeenCalledTimes(2);
    expect(mockShowToast).toHaveBeenLastCalledWith('Session saved');
  });

  it('keeps session in progress after closing summary when upload failed', async () => {
    setupRepositoryFailure();

    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /^end session$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(screen.queryByRole('dialog', { name: /^end session$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(screen.getByRole('dialog', { name: /end session\?/i })).toBeInTheDocument();
  });

  it('ends session after closing summary when upload succeeded', async () => {
    render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /^end session$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(screen.queryByRole('dialog', { name: /^end session$/i })).not.toBeInTheDocument();
    expect(mockSaveGameSession).toHaveBeenCalledTimes(1);
  });

  it('updates the same session when ending again after edits', async () => {
    let currentSessionId: string | null = null;
    const setSavedSession = vi.fn((id: string) => { currentSessionId = id; });

    mockUsePayoutCalculator.mockImplementation(() => ({
      ...mockCalcBase,
      get currentSessionId() { return currentSessionId; },
      setSavedSession,
      rows: [
        { id: 'r1', name: 'Alice', buyIn: '50', cashOut: '50', paid: false, settled: false },
      ],
      isBalanced: true,
      totalIn: 50,
      totalOut: 50,
      clearTable: vi.fn(),
    }));

    const { rerender } = render(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));
    await waitFor(() => expect(setSavedSession).toHaveBeenCalledTimes(1));
    const firstSessionId = setSavedSession.mock.calls[0][0] as string;

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    mockUsePayoutCalculator.mockImplementation(() => ({
      ...mockCalcBase,
      get currentSessionId() { return firstSessionId; },
      setSavedSession,
      rows: [
        { id: 'r1', name: 'Alice', buyIn: '60', cashOut: '60', paid: false, settled: false, dbPlayerId: 'p1' },
      ],
      isBalanced: true,
      totalIn: 60,
      totalOut: 60,
      clearTable: vi.fn(),
    }));
    rerender(<PayoutTable />);

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end & upload/i }));

    await waitFor(() => expect(setSavedSession).toHaveBeenCalledTimes(2));
    expect(setSavedSession.mock.calls[1][0]).toBe(firstSessionId);
    expect(mockShowToast).toHaveBeenLastCalledWith('Session updated');
  });
});
