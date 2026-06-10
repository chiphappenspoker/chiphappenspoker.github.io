'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PayoutRowData } from '@/lib/types';
import { parseNum, fmt, fmtInt } from '@/lib/calc/formatting';
import { calculatePayouts } from '@/lib/calc/payout';
import { computeGreedyTransactions } from '@/lib/calc/settlement';
import { decodePayoutShareData } from '@/lib/sharing/payout-share';
import { getLocalStorage, setLocalStorage, removeLocalStorage } from '@/lib/storage/local-storage';
import { getRepository } from '@/lib/data/sync-repository';
import {
  PAYOUT_STORAGE_KEY,
  MAX_ROWS,
  SELECTED_GROUP_CHANGED_EVENT,
  GROUP_MEMBERS_CHANGED_EVENT,
  SETTINGS_MODAL_CLOSED_EVENT,
  OPEN_SIGN_IN_EVENT,
} from '@/lib/constants';
import type { DbGamePlayer, DbGameSession } from '@/lib/types';
import { useSettings } from './useSettings';
import { useGroups } from './useGroups';

export function usePayoutCalculator() {
  const { settings } = useSettings();
  const { groups, getGroupMembers, loggedIn, loading: groupsLoading } = useGroups();
  const [groupMembers, setGroupMembers] = useState<{ name: string; revtag: string }[]>([]);

  const [rows, setRows] = useState<PayoutRowData[]>([]);
  const [buyIn, setBuyInRaw] = useState('30');
  /** Session id after first save; null until then or after clear. Subsequent saves upsert this session. */
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sharedSessionCode, setSharedSessionCode] = useState<string | null>(null);
  const [sessionCreatedBy, setSessionCreatedBy] = useState<string | null>(null);
  const [shareCodeAuthRequired, setShareCodeAuthRequired] = useState(false);
  const [selectedGroupIdInternal, setSelectedGroupIdInternal] = useState<string | null>(null);
  const [showSuspects, setShowSuspects] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const nextId = useRef(0);
  const pendingShareCodeRef = useRef<string | null>(null);
  const generateId = () => `prow-${nextId.current++}`;

  // Selected group: when set, its currency/default_buy_in/settlement_mode override profile settings
  const selectedGroupId = selectedGroupIdInternal;
  const selectedGroup = useMemo(
    () => (selectedGroupId ? groups.find((g) => g.id === selectedGroupId) ?? null : null),
    [groups, selectedGroupId]
  );

  // Effective settings: group overrides profile for payout calculator
  const effectiveCurrency = selectedGroup?.currency ?? settings.gameSettings.currency;
  const effectiveSettlementMode = (selectedGroup?.settlement_mode ?? settings.gameSettings.settlementMode) as
    | 'greedy'
    | 'banker';
  const effectiveDefaultBuyIn = selectedGroup?.default_buy_in ?? settings.gameSettings.defaultBuyIn ?? '30';

  // Derived calculations
  const result = useMemo(() => calculatePayouts(rows), [rows]);
  const { totalIn, totalOut, totalPayout, isBalanced, payouts } = result;

  const settlementMode = effectiveSettlementMode;
  const currency = effectiveCurrency;

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupMembers([]);
      return;
    }
    getGroupMembers(selectedGroupId)
      .then(setGroupMembers)
      .catch(() => setGroupMembers([]));
  }, [selectedGroupId, getGroupMembers, groups]);

  const allSuspects = useMemo(() => {
    const raw = selectedGroupId && loggedIn
      ? groupMembers.map((s) => s.name)
      : settings.usualSuspects.map((s) => s.name);
    return raw.filter((name) => name.trim().length > 0);
  }, [selectedGroupId, loggedIn, groupMembers, settings.usualSuspects]);

  const availableSuspects = useMemo(() => {
    const usedNames = new Set(
      rows.map((r) => r.name.trim()).filter(Boolean)
    );
    return allSuspects.filter((name) => !usedNames.has(name));
  }, [allSuspects, rows]);

  const transactions = useMemo(() => {
    if (settlementMode !== 'greedy') return [];
    const balances = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        amount: parseNum(r.cashOut) - parseNum(r.buyIn),
      }))
      .filter((b) => Math.abs(b.amount) >= 0.005);
    return computeGreedyTransactions(balances);
  }, [rows, settlementMode]);

  // Sync when selected group is changed from elsewhere (e.g. SelectGroupModal from hamburger or other tab)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ selectedGroupId: string | null }>).detail;
      if (detail && 'selectedGroupId' in detail) {
        setSelectedGroupIdInternal(detail.selectedGroupId ?? null);
      }
    };
    window.addEventListener(SELECTED_GROUP_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SELECTED_GROUP_CHANGED_EVENT, handler);
  }, []);

  // Refetch group members when membership changes or when settings modal closes (so Usual Suspects list stays in sync)
  useEffect(() => {
    const onMembersChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ groupId: string }>).detail;
      if (detail?.groupId && detail.groupId === selectedGroupId) {
        getGroupMembers(selectedGroupId).then(setGroupMembers).catch(() => setGroupMembers([]));
      }
    };
    const onSettingsClosed = () => {
      if (selectedGroupId) {
        getGroupMembers(selectedGroupId).then(setGroupMembers).catch(() => setGroupMembers([]));
      }
    };
    window.addEventListener(GROUP_MEMBERS_CHANGED_EVENT, onMembersChanged);
    window.addEventListener(SETTINGS_MODAL_CLOSED_EVENT, onSettingsClosed);
    return () => {
      window.removeEventListener(GROUP_MEMBERS_CHANGED_EVENT, onMembersChanged);
      window.removeEventListener(SETTINGS_MODAL_CLOSED_EVENT, onSettingsClosed);
    };
  }, [selectedGroupId, getGroupMembers]);

  // When user changes group selection, apply that group's default buy-in (or profile default if none)
  const setSelectedGroupId = useCallback(
    (id: string | null) => {
      setSelectedGroupIdInternal(id);
      const g = id ? groups.find((gr) => gr.id === id) : null;
      const def = g ? g.default_buy_in : settings.gameSettings.defaultBuyIn ?? '30';
      setBuyInRaw(def);
    },
    [groups, settings.gameSettings.defaultBuyIn]
  );

  const applyLoadedSharedSession = useCallback(
    (session: DbGameSession, players: DbGamePlayer[], code: string) => {
      setBuyInRaw(session.default_buy_in);
      if (session.group_id) setSelectedGroupIdInternal(session.group_id);
      setCurrentSessionId(session.id);
      setSharedSessionCode(session.share_code || code);
      setSessionCreatedBy(session.created_by);
      setShareCodeAuthRequired(false);
      setRows(
        players.length > 0
          ? players.map((p) => ({
              id: generateId(),
              name: p.player_name,
              buyIn: String(p.buy_in),
              cashOut: String(p.cash_out),
              settled: p.settled,
              paid: p.settled,
              dbPlayerId: p.id,
            }))
          : [
              { id: generateId(), name: '', buyIn: session.default_buy_in, cashOut: '', settled: false, paid: false },
              { id: generateId(), name: '', buyIn: session.default_buy_in, cashOut: '', settled: false, paid: false },
            ]
      );
      setInitialized(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const loadFromShareCode = useCallback(
    async (code: string): Promise<boolean> => {
      const repo = getRepository(true);
      const loaded = await repo.getSessionByShareCode(code);
      if (!loaded?.session) return false;
      applyLoadedSharedSession(loaded.session, loaded.players, code);
      return true;
    },
    [applyLoadedSharedSession]
  );

  // Initialize from share URL or localStorage
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const shareCode = params.get('code');
      if (shareCode) {
        pendingShareCodeRef.current = shareCode;
        if (!loggedIn) {
          setShareCodeAuthRequired(true);
          setInitialized(true);
          window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
          return;
        }
        const loaded = await loadFromShareCode(shareCode);
        if (loaded) return;
      }

      const shareData = params.get('s') || params.get('share');

      if (shareData) {
        try {
          const data = await decodePayoutShareData(shareData);
          if (data?.rows) {
            if (data.buyIn) setBuyInRaw(data.buyIn);
            setRows(
              data.rows.map((r) => ({
                id: generateId(),
                name: r.name ?? '',
                buyIn: r.in ?? '',
                cashOut: r.out ?? '',
                settled: r.settled ?? false,
                paid: r.settled ?? false,
              }))
            );
            setInitialized(true);
            return;
          }
        } catch {
          /* ignore bad share data */
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = getLocalStorage<any>(PAYOUT_STORAGE_KEY);
      if (saved?.rows && Array.isArray(saved.rows)) {
        if (saved.buyIn) setBuyInRaw(saved.buyIn);
        if (saved.selectedGroupId != null) setSelectedGroupIdInternal(saved.selectedGroupId);
        if (saved.currentSessionId != null) setCurrentSessionId(saved.currentSessionId);
        if (saved.sharedSessionCode != null) setSharedSessionCode(saved.sharedSessionCode);
        if (saved.sessionCreatedBy != null) setSessionCreatedBy(saved.sessionCreatedBy);
        setRows(
          saved.rows.map((r: Record<string, string | boolean | undefined>) => ({
            id: generateId(),
            name: (r.name as string) ?? '',
            buyIn: (r.in as string) ?? '',
            cashOut: (r.out as string) ?? '',
            settled: Boolean(r.settled),
            paid: Boolean(r.paid ?? r.settled),
            dbPlayerId: typeof r.playerId === 'string' ? r.playerId : undefined,
          }))
        );
        setInitialized(true);
        return;
      }

      // Default: 2 empty rows
      const defBuyIn = settings.gameSettings.defaultBuyIn || '30';
      setBuyInRaw(defBuyIn);
      setRows([
        { id: generateId(), name: '', buyIn: defBuyIn, cashOut: '', settled: false, paid: false },
        { id: generateId(), name: '', buyIn: defBuyIn, cashOut: '', settled: false, paid: false },
      ]);
      setInitialized(true);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const code =
      pendingShareCodeRef.current ?? new URLSearchParams(window.location.search).get('code');
    if (!code || currentSessionId) return;
    void loadFromShareCode(code);
  }, [loggedIn, loadFromShareCode, currentSessionId]);

  // Apply game settings on change (settlement mode, currency, default buy-in)
  const appliedSettingsRef = useRef(false);
  useEffect(() => {
    if (!initialized) return;
    if (!appliedSettingsRef.current) {
      appliedSettingsRef.current = true;
      return;
    }
    // Only live-update the buy-in if the user hasn't changed it manually
  }, [settings.gameSettings, initialized]);

  // Save to localStorage on change
  useEffect(() => {
    if (!initialized) return;
    setLocalStorage(PAYOUT_STORAGE_KEY, {
      rows: rows.map((r) => ({
        name: r.name,
        in: r.buyIn,
        out: r.cashOut,
        settled: r.settled,
        paid: r.paid,
        playerId: r.dbPlayerId,
      })),
      buyIn,
      selectedGroupId: selectedGroupId ?? undefined,
      currentSessionId: currentSessionId ?? undefined,
      sharedSessionCode: sharedSessionCode ?? undefined,
      sessionCreatedBy: sessionCreatedBy ?? undefined,
    });
  }, [rows, buyIn, selectedGroupId, currentSessionId, sharedSessionCode, sessionCreatedBy, initialized]);

  // Methods
  const addRow = useCallback(
    (values?: Partial<PayoutRowData>) => {
      setRows((prev) => {
        if (prev.length >= MAX_ROWS) return prev;
        return [
          ...prev,
          {
            id: generateId(),
            name: values?.name ?? '',
            buyIn: values?.buyIn ?? buyIn,
            cashOut: values?.cashOut ?? '',
            settled: values?.settled ?? false,
            paid: values?.paid ?? false,
            dbPlayerId: undefined,
          },
        ];
      });
    },
    [buyIn]
  );

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback(
    (index: number, field: keyof PayoutRowData, value: string | boolean) => {
      setRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
      );
    },
    []
  );

  const adjustBuyIn = useCallback(
    (index: number, delta: number) => {
      const buyInNum = parseNum(buyIn);
      if (!Number.isFinite(buyInNum) || buyInNum === 0) return;
      setRows((prev) =>
        prev.map((row, i) => {
          if (i !== index) return row;
          const current = parseNum(row.buyIn);
          let newVal = current + delta * buyInNum;
          if (newVal < buyInNum) newVal = buyInNum;
          return { ...row, buyIn: fmtInt(newVal) };
        })
      );
    },
    [buyIn]
  );

  const handleBuyInChange = useCallback((newBuyIn: string) => {
    setBuyInRaw(newBuyIn);
    const parsed = parseNum(newBuyIn);
    if (Number.isFinite(parsed) && parsed > 0) {
      setRows((prev) =>
        prev.map((row) => ({ ...row, buyIn: fmtInt(parsed) }))
      );
    }
  }, []);

  const clearTable = useCallback(() => {
    nextId.current = 0;
    setCurrentSessionId(null);
    setSharedSessionCode(null);
    setSessionCreatedBy(null);
    setShareCodeAuthRequired(false);
    pendingShareCodeRef.current = null;
    setSelectedGroupIdInternal(null);
    const defaultBuyIn = settings.gameSettings.defaultBuyIn ?? '30';
    setRows([
      { id: generateId(), name: '', buyIn: defaultBuyIn, cashOut: '', settled: false, paid: false },
      { id: generateId(), name: '', buyIn: defaultBuyIn, cashOut: '', settled: false, paid: false },
    ]);
    setBuyInRaw(defaultBuyIn);
    setShowSuspects(false);
    removeLocalStorage(PAYOUT_STORAGE_KEY);
  }, [settings.gameSettings.defaultBuyIn]);

  /** Call after save: first save passes new session id and new player ids; subsequent saves pass same session id and ids used for upsert. Empty-name rows get undefined. */
  const setSavedSession = useCallback(
    (
      sessionId: string,
      playerIds: (string | undefined)[],
      shareCode?: string | null,
      createdBy?: string | null
    ) => {
      setCurrentSessionId(sessionId);
      if (shareCode) setSharedSessionCode(shareCode);
      if (createdBy) setSessionCreatedBy(createdBy);
      setRows((prev) =>
        prev.map((row, i) => ({
          ...row,
          dbPlayerId: playerIds[i],
        }))
      );
    },
    []
  );

  const toggleSuspects = useCallback(() => {
    setShowSuspects((prev) => !prev);
  }, []);

  const addSuspectToRow = useCallback(
    (name: string) => {
      setRows((prev) => {
        const emptyIdx = prev.findIndex((r) => !r.name.trim());
        if (emptyIdx >= 0) {
          return prev.map((row, i) =>
            i === emptyIdx
              ? { ...row, name, buyIn: row.buyIn || fmtInt(parseNum(buyIn)) }
              : row
          );
        }
        if (prev.length >= MAX_ROWS) return prev;
        return [
          ...prev,
          {
            id: generateId(),
            name,
            buyIn: buyIn || '',
            cashOut: '',
            settled: false,
            paid: false,
            dbPlayerId: undefined,
          },
        ];
      });
    },
    [buyIn]
  );

  /**
   * Merge checked usual suspects with existing rows. Keeps order; removes unchecked suspects;
   * fills empty rows first with checked names (in checkbox order), then appends any remainder.
   */
  const setRowsFromSelectedNames = useCallback(
    (checkedNames: string[], suspectNames: string[]) => {
      const suspectSet = new Set(
        suspectNames.map((n) => n.trim().toLowerCase()).filter(Boolean)
      );
      const trimmedChecked = checkedNames.map((n) => n.trim()).filter(Boolean);
      const checkedSet = new Set(trimmedChecked.map((n) => n.toLowerCase()));
      setRows((prev) => {
        const queue = trimmedChecked.slice();
        const result: PayoutRowData[] = [];
        const inResult = (nm: string) =>
          result.some((r) => r.name.trim().toLowerCase() === nm.toLowerCase());

        for (const row of prev) {
          const name = row.name.trim();
          if (!name) {
            const idx = queue.findIndex((nm) => !inResult(nm));
            if (idx >= 0) {
              const next = queue[idx];
              queue.splice(idx, 1);
              result.push({
                ...row,
                name: next,
                buyIn: row.buyIn || fmtInt(parseNum(buyIn)),
                cashOut: row.cashOut ?? '',
                settled: false,
                paid: false,
                dbPlayerId: undefined,
              });
            } else {
              result.push(row);
            }
            continue;
          }

          if (suspectSet.has(name.toLowerCase()) && !checkedSet.has(name.toLowerCase())) {
            continue;
          }

          const qi = queue.findIndex((nm) => nm.toLowerCase() === name.toLowerCase());
          if (qi >= 0) queue.splice(qi, 1);
          result.push(row);
        }

        while (queue.length > 0 && result.length < MAX_ROWS) {
          const nm = queue.shift()!;
          if (inResult(nm)) continue;
          result.push({
            id: generateId(),
            name: nm,
            buyIn: fmtInt(parseNum(buyIn)),
            cashOut: '',
            settled: false,
            paid: false,
            dbPlayerId: undefined,
          });
        }

        return result;
      });
    },
    [buyIn]
  );

  const getPlayerNames = useCallback(() => {
    return rows.map((r) => r.name.trim()).filter(Boolean);
  }, [rows]);

  return {
    rows,
    buyIn,
    setBuyIn: handleBuyInChange,
    currentSessionId,
    sharedSessionCode,
    sessionCreatedBy,
    shareCodeAuthRequired,
    setSavedSession,
    selectedGroupId,
    selectedGroup,
    setSelectedGroupId,
    totalIn,
    totalOut,
    totalPayout,
    isBalanced,
    payouts,
    addRow,
    removeRow,
    updateRow,
    adjustBuyIn,
    clearTable,
    showSuspects,
    toggleSuspects,
    allSuspects,
    availableSuspects,
    addSuspectToRow,
    setRowsFromSelectedNames,
    getPlayerNames,
    settlementMode,
    currency,
    transactions,
    initialized,
    fmt,
    fmtInt,
    parseNum,
    usualSuspectsForSettlement: selectedGroupId ? groupMembers : settings.usualSuspects,
    groupsLoading,
  };
}
