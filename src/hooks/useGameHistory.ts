'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useEntitlements } from '@/lib/entitlements/EntitlementsProvider';
import { FREE_TIER_HISTORY_DISPLAY_CAP } from '@/lib/entitlements/constants';
import { getRepository } from '@/lib/data/sync-repository';
import { getLocalStorage } from '@/lib/storage/local-storage';
import { PAYOUT_STORAGE_KEY, SELECTED_GROUP_CHANGED_EVENT } from '@/lib/constants';
import type { DbGameSession } from '@/lib/types';

export interface GameHistoryFilters {
  groupId: string | null;
  fromDate: string;
  toDate: string;
}

const defaultFilters: GameHistoryFilters = {
  groupId: null,
  fromDate: '',
  toDate: '',
};

function getInitialFilters(): GameHistoryFilters {
  if (typeof window === 'undefined') return defaultFilters;
  const saved = getLocalStorage<{ selectedGroupId?: string }>(PAYOUT_STORAGE_KEY);
  const groupId = saved?.selectedGroupId ?? null;
  return { ...defaultFilters, groupId: groupId || null };
}

function sortSessionsNewestFirst(list: DbGameSession[]): DbGameSession[] {
  return [...list].sort((a, b) => {
    const ta = a.created_at || `${a.session_date}T00:00:00`;
    const tb = b.created_at || `${b.session_date}T00:00:00`;
    return ta < tb ? 1 : ta > tb ? -1 : 0;
  });
}

export function useGameHistory() {
  const { user } = useAuth();
  const { tier, flags, loading: entitlementsLoading } = useEntitlements();
  const [sessions, setSessions] = useState<DbGameSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<GameHistoryFilters>(getInitialFilters);

  const effectiveFilters = useMemo((): GameHistoryFilters => {
    if (flags.canGroups) return filters;
    return { ...filters, groupId: null };
  }, [flags.canGroups, filters]);

  const setFilters = useCallback((update: Partial<GameHistoryFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...update }));
  }, []);

  useEffect(() => {
    if (!flags.canGroups && filters.groupId) {
      setFiltersState((prev) => ({ ...prev, groupId: null }));
    }
  }, [flags.canGroups, filters.groupId]);

  const reload = useCallback(async () => {
    if (!user) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (entitlementsLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const repo = getRepository(true);
      let list = await repo.getGameSessionsForUser({
        groupId: effectiveFilters.groupId ?? undefined,
        fromDate: effectiveFilters.fromDate || undefined,
        toDate: effectiveFilters.toDate || undefined,
      });
      if (tier === 'free') {
        list = sortSessionsNewestFirst(list).slice(0, FREE_TIER_HISTORY_DISPLAY_CAP);
      }
      setSessions(list);
    } catch (e) {
      setError((e as Error).message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user, entitlementsLoading, tier, effectiveFilters.groupId, effectiveFilters.fromDate, effectiveFilters.toDate]);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    void reload();
  }, [user, reload]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ selectedGroupId: string | null }>).detail;
      if (detail && 'selectedGroupId' in detail) {
        setFiltersState((prev) => ({ ...prev, groupId: detail.selectedGroupId ?? null }));
      }
    };
    window.addEventListener(SELECTED_GROUP_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SELECTED_GROUP_CHANGED_EVENT, handler);
  }, []);

  return { sessions, loading, error, filters, setFilters, reload };
}
