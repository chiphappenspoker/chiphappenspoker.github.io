'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SidePotPlayerData, CalculatedPot } from '@/lib/types';
import { parseNum, fmt, fmtInt } from '@/lib/calc/formatting';
import { calculateSidePots, calculateWinnings } from '@/lib/calc/sidepot';
import { encodeSidePotShareData, decodeSidePotShareData } from '@/lib/sharing/sidepot-share';
import { getLocalStorage } from '@/lib/storage/local-storage';
import {
  PAYOUT_STORAGE_KEY,
  MAX_ROWS,
  GROUP_MEMBERS_CHANGED_EVENT,
  SETTINGS_MODAL_CLOSED_EVENT,
} from '@/lib/constants';
import { useSettings } from './useSettings';
import { useGroups } from './useGroups';

export function useSidePotCalculator() {
  const { settings } = useSettings();
  const { getGroupMembers, loggedIn, groups } = useGroups();
  const [groupMembers, setGroupMembers] = useState<{ name: string; revtag: string }[]>([]);

  // Use the group selected in the payout calculator for usual suspects (no separate group selection here)
  const [payoutSelectedGroupId, setPayoutSelectedGroupId] = useState<string | null>(
    () => getLocalStorage<{ selectedGroupId?: string }>(PAYOUT_STORAGE_KEY)?.selectedGroupId ?? null
  );

  const [rows, setRows] = useState<SidePotPlayerData[]>([]);
  const [initialPot, setInitialPot] = useState('');
  const [boards, setBoards] = useState(1);
  const [showSuspects, setShowSuspects] = useState(false);
  const [winnerSelections, setWinnerSelections] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  const nextId = useRef(0);
  const generateId = () => `srow-${nextId.current++}`;

  // Derived calculations
  const totalBet = useMemo(() => {
    let total = parseNum(initialPot);
    for (const row of rows) {
      total += parseNum(row.bet);
    }
    return total;
  }, [rows, initialPot]);

  const pots = useMemo((): CalculatedPot[] => {
    const players = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim() || '(no name)', bet: parseNum(r.bet) }));
    return calculateSidePots(players, parseNum(initialPot));
  }, [rows, initialPot]);

  // Auto-select single-player pots
  const effectiveWinnerSelections = useMemo(() => {
    const selections = { ...winnerSelections };
    for (let potIdx = 0; potIdx < pots.length; potIdx++) {
      const pot = pots[potIdx];
      if (pot.players.length === 1) {
        for (let boardNum = 0; boardNum < boards; boardNum++) {
          const key = `${potIdx}-${boardNum}-${pot.players[0]}`;
          selections[key] = true;
        }
      }
    }
    return selections;
  }, [winnerSelections, pots, boards]);

  const { playerWinnings, totalWon } = useMemo(
    () => calculateWinnings(pots, boards, effectiveWinnerSelections),
    [pots, boards, effectiveWinnerSelections]
  );

  const isBalanced = useMemo(
    () => Math.abs(Math.round((totalWon - totalBet) * 100)) === 0,
    [totalWon, totalBet]
  );

  // Sync payout's selected group when user returns to this tab (e.g. after changing group on Payout page)
  useEffect(() => {
    const onFocus = () => {
      const id = getLocalStorage<{ selectedGroupId?: string }>(PAYOUT_STORAGE_KEY)?.selectedGroupId ?? null;
      setPayoutSelectedGroupId(id);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!payoutSelectedGroupId) {
      setGroupMembers([]);
      return;
    }
    getGroupMembers(payoutSelectedGroupId)
      .then(setGroupMembers)
      .catch(() => setGroupMembers([]));
  }, [payoutSelectedGroupId, getGroupMembers, groups]);

  // Refetch group members when membership changes or when settings modal closes (so Usual Suspects list stays in sync)
  useEffect(() => {
    const onMembersChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ groupId: string }>).detail;
      if (detail?.groupId && detail.groupId === payoutSelectedGroupId) {
        getGroupMembers(payoutSelectedGroupId).then(setGroupMembers).catch(() => setGroupMembers([]));
      }
    };
    const onSettingsClosed = () => {
      if (payoutSelectedGroupId) {
        getGroupMembers(payoutSelectedGroupId).then(setGroupMembers).catch(() => setGroupMembers([]));
      }
    };
    window.addEventListener(GROUP_MEMBERS_CHANGED_EVENT, onMembersChanged);
    window.addEventListener(SETTINGS_MODAL_CLOSED_EVENT, onSettingsClosed);
    return () => {
      window.removeEventListener(GROUP_MEMBERS_CHANGED_EVENT, onMembersChanged);
      window.removeEventListener(SETTINGS_MODAL_CLOSED_EVENT, onSettingsClosed);
    };
  }, [payoutSelectedGroupId, getGroupMembers]);

  const selectedGroup = useMemo(
    () =>
      payoutSelectedGroupId
        ? groups.find((g) => g.id === payoutSelectedGroupId) ?? null
        : null,
    [payoutSelectedGroupId, groups]
  );

  const allSuspects = useMemo(() => {
    const raw =
      payoutSelectedGroupId && loggedIn
        ? groupMembers.map((s) => s.name)
        : settings.usualSuspects.map((s) => s.name);
    return raw.filter((name) => name.trim().length > 0);
  }, [payoutSelectedGroupId, loggedIn, groupMembers, settings.usualSuspects]);

  const availableSuspects = useMemo(() => {
    const usedNames = new Set(rows.map((r) => r.name.trim()).filter(Boolean));
    return allSuspects.filter((name) => !usedNames.has(name));
  }, [allSuspects, rows]);

  // Initialize from share URL, transferred names, or default (ad-hoc only: no session persistence)
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const shareData = params.get('s') || params.get('share');
      const transferredNames = params.get('names');

      if (shareData) {
        try {
          const data = await decodeSidePotShareData(shareData);
          if (data?.rows) {
            if (data.boards) setBoards(Math.max(1, Math.min(2, parseInt(data.boards) || 1)));
            setInitialPot(data.initialPot || '');
            setRows(
              data.rows.map((r) => ({
                id: generateId(),
                name: r.name ?? '',
                bet: r.bet ?? '',
              }))
            );
            setInitialized(true);
            return;
          }
        } catch {
          /* ignore bad share data */
        }
      }

      if (transferredNames) {
        const names = transferredNames.split(',').filter((n) => n.trim());
        if (names.length > 0) {
          setRows(
            names.map((name) => ({
              id: generateId(),
              name: name.trim(),
              bet: '',
            }))
          );
          setInitialized(true);
          return;
        }
      }

      // Default: 2 empty rows (ad-hoc, no restore from storage)
      setRows([
        { id: generateId(), name: '', bet: '' },
        { id: generateId(), name: '', bet: '' },
      ]);
      setInitialized(true);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Methods
  const addRow = useCallback((values?: Partial<SidePotPlayerData>) => {
    setRows((prev) => {
      if (prev.length >= MAX_ROWS) return prev;
      return [
        ...prev,
        {
          id: generateId(),
          name: values?.name ?? '',
          bet: values?.bet ?? '',
        },
      ];
    });
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback(
    (index: number, field: keyof SidePotPlayerData, value: string) => {
      setRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
      );
    },
    []
  );

  const setBoardsValue = useCallback((n: number) => {
    setBoards(Math.max(1, Math.min(2, n)));
  }, []);

  const clearTable = useCallback(() => {
    nextId.current = 0;
    setRows([
      { id: generateId(), name: '', bet: '' },
      { id: generateId(), name: '', bet: '' },
    ]);
    setInitialPot('');
    setBoards(1);
    setShowSuspects(false);
    setWinnerSelections({});
  }, []);

  const toggleSuspects = useCallback(() => {
    setShowSuspects((prev) => !prev);
  }, []);

  const toggleWinner = useCallback(
    (potIdx: number, boardNum: number, playerName: string) => {
      setWinnerSelections((prev) => {
        const key = `${potIdx}-${boardNum}-${playerName}`;
        const isChecked = !prev[key];
        const next = { ...prev, [key]: isChecked };

        // Cascade: if checking/unchecking a winner, do the same in higher pots
        for (let pi = potIdx + 1; pi < pots.length; pi++) {
          if (pots[pi].players.includes(playerName)) {
            const cascadeKey = `${pi}-${boardNum}-${playerName}`;
            next[cascadeKey] = isChecked;
          }
        }

        return next;
      });
    },
    [pots]
  );

  const addSuspectToRow = useCallback((name: string) => {
    setRows((prev) => {
      const emptyIdx = prev.findIndex((r) => !r.name.trim());
      if (emptyIdx >= 0) {
        return prev.map((row, i) =>
          i === emptyIdx ? { ...row, name } : row
        );
      }
      if (prev.length >= MAX_ROWS) return prev;
      return [
        ...prev,
        { id: generateId(), name, bet: '' },
      ];
    });
  }, []);

  /**
   * Merge checked usual suspects with existing rows. Fills empty rows first (checkbox order),
   * then appends any remaining names.
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
        const result: SidePotPlayerData[] = [];
        const inResult = (nm: string) =>
          result.some((r) => r.name.trim().toLowerCase() === nm.toLowerCase());

        for (const row of prev) {
          const name = row.name.trim();
          if (!name) {
            const idx = queue.findIndex((nm) => !inResult(nm));
            if (idx >= 0) {
              const next = queue[idx];
              queue.splice(idx, 1);
              result.push({ ...row, name: next, bet: row.bet ?? '' });
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
          result.push({ id: generateId(), name: nm, bet: '' });
        }

        return result;
      });
    },
    []
  );

  const getShareUrl = useCallback(async () => {
    const shareData = {
      rows: rows.map((r) => ({ name: r.name, bet: r.bet })),
      boards: String(boards),
      initialPot,
    };
    const encoded = await encodeSidePotShareData(shareData);
    return window.location.href.split('?')[0] + '?s=' + encoded;
  }, [rows, boards, initialPot]);

  return {
    rows,
    initialPot,
    setInitialPot,
    boards,
    selectedGroup,
    setBoards: setBoardsValue,
    totalBet,
    totalWon,
    isBalanced,
    pots,
    playerWinnings,
    winnerSelections: effectiveWinnerSelections,
    toggleWinner,
    addRow,
    removeRow,
    updateRow,
    clearTable,
    showSuspects,
    toggleSuspects,
    allSuspects,
    availableSuspects,
    addSuspectToRow,
    setRowsFromSelectedNames,
    getShareUrl,
    initialized,
    fmt,
    fmtInt,
    parseNum,
  };
}
