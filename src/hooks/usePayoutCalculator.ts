'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PayoutRowData } from '@/lib/types';
import { parseNum, fmt, fmtInt } from '@/lib/calc/formatting';
import { calculatePayouts } from '@/lib/calc/payout';
import { computeGreedyTransactions } from '@/lib/calc/settlement';
import { encodePayoutShareData, decodePayoutShareData } from '@/lib/sharing/payout-share';
import { getLocalStorage, setLocalStorage, removeLocalStorage } from '@/lib/storage/local-storage';
import { PAYOUT_STORAGE_KEY, MAX_ROWS } from '@/lib/constants';
import { useSettings } from './useSettings';
import { useGroups } from './useGroups';

export function usePayoutCalculator() {
  const { settings } = useSettings();
  const { groups, getGroupMembers, loggedIn } = useGroups();
  const [groupMembers, setGroupMembers] = useState<{ name: string; revtag: string }[]>([]);

  const [rows, setRows] = useState<PayoutRowData[]>([]);
  const [buyIn, setBuyInRaw] = useState('30');
  /** Session id after first save; null until then or after clear. Subsequent saves upsert this session. */
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedGroupIdInternal, setSelectedGroupIdInternal] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [checkboxesVisible, setCheckboxesVisible] = useState(false);
  const [showSuspects, setShowSuspects] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const nextId = useRef(0);
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

  const tableLocked = checkboxesVisible;
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

  // Initialize from share URL or localStorage
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
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
        setRows(
          saved.rows.map((r: Record<string, string | boolean | undefined>) => ({
            id: generateId(),
            name: (r.name as string) ?? '',
            buyIn: (r.in as string) ?? '',
            cashOut: (r.out as string) ?? '',
            settled: Boolean(r.settled),
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
        { id: generateId(), name: '', buyIn: defBuyIn, cashOut: '', settled: false },
        { id: generateId(), name: '', buyIn: defBuyIn, cashOut: '', settled: false },
      ]);
      setInitialized(true);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        playerId: r.dbPlayerId,
      })),
      buyIn,
      selectedGroupId: selectedGroupId ?? undefined,
      currentSessionId: currentSessionId ?? undefined,
    });
  }, [rows, buyIn, selectedGroupId, currentSessionId, initialized]);

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
    setRows([
      { id: generateId(), name: '', buyIn: effectiveDefaultBuyIn, cashOut: '', settled: false },
      { id: generateId(), name: '', buyIn: effectiveDefaultBuyIn, cashOut: '', settled: false },
    ]);
    setBuyInRaw(effectiveDefaultBuyIn);
    setDeleteMode(false);
    setCheckboxesVisible(false);
    setShowSuspects(false);
    removeLocalStorage(PAYOUT_STORAGE_KEY);
  }, [effectiveDefaultBuyIn]);

  /** Call after save: first save passes new session id and new player ids; subsequent saves pass same session id and ids used for upsert. Empty-name rows get undefined. */
  const setSavedSession = useCallback((sessionId: string, playerIds: (string | undefined)[]) => {
    setCurrentSessionId(sessionId);
    setRows((prev) =>
      prev.map((row, i) => ({
        ...row,
        dbPlayerId: playerIds[i],
      }))
    );
  }, []);

  const toggleDeleteMode = useCallback(() => {
    setDeleteMode((prev) => {
      if (!prev) setCheckboxesVisible(false);
      return !prev;
    });
  }, []);

  const toggleSettle = useCallback(() => {
    setShowSuspects(false);
    setDeleteMode(false);
    setCheckboxesVisible((prev) => !prev);
  }, []);

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
            dbPlayerId: undefined,
          },
        ];
      });
    },
    [buyIn]
  );

  const getShareUrl = useCallback(async () => {
    const shareData = {
      rows: rows.map((r) => ({
        name: r.name,
        in: r.buyIn,
        out: r.cashOut,
        settled: r.settled,
      })),
      buyIn,
    };
    const encoded = await encodePayoutShareData(shareData);
    return window.location.href.split('?')[0] + '?s=' + encoded;
  }, [rows, buyIn]);

  const getPlayerNames = useCallback(() => {
    return rows.map((r) => r.name.trim()).filter(Boolean);
  }, [rows]);

  return {
    rows,
    buyIn,
    setBuyIn: handleBuyInChange,
    currentSessionId,
    setSavedSession,
    selectedGroupId,
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
    deleteMode,
    toggleDeleteMode,
    checkboxesVisible,
    toggleSettle,
    tableLocked,
    showSuspects,
    toggleSuspects,
    availableSuspects,
    addSuspectToRow,
    getShareUrl,
    getPlayerNames,
    settlementMode,
    currency,
    transactions,
    initialized,
    fmt,
    fmtInt,
    parseNum,
    usualSuspectsForSettlement: selectedGroupId ? groupMembers : settings.usualSuspects,
  };
}
