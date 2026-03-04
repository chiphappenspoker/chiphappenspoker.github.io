'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getRepository } from '@/lib/data/sync-repository';
import type { GroupMemberWithId } from '@/lib/data/repository';
import type { DbGroup } from '@/lib/types';
import type { UsualSuspect } from '@/lib/types';

export interface GroupsContextValue {
  groups: DbGroup[];
  loading: boolean;
  getGroupMembers: (groupId: string) => Promise<UsualSuspect[]>;
  getGroupMembersWithIds: (groupId: string) => Promise<GroupMemberWithId[]>;
  createGroup: (name: string, currency?: string, defaultBuyIn?: string, settlementMode?: string) => Promise<DbGroup>;
  updateGroup: (params: { id: string; name?: string; currency?: string; default_buy_in?: string; settlement_mode?: string }) => Promise<DbGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  addGroupMember: (groupId: string, userId: string) => Promise<void>;
  removeGroupMember: (groupId: string, userId: string) => Promise<void>;
  reload: () => Promise<void>;
  loggedIn: boolean;
}

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<DbGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const loggedIn = !!user;

  const loadGroups = useCallback(async () => {
    if (!loggedIn) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const repo = getRepository(true);
      const list = await repo.getGroups();
      setGroups(list);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [loggedIn]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const getGroupMembers = useCallback(
    async (groupId: string): Promise<UsualSuspect[]> => {
      if (!loggedIn) return [];
      const repo = getRepository(true);
      return repo.getGroupMembers(groupId);
    },
    [loggedIn]
  );

  const getGroupMembersWithIds = useCallback(
    async (groupId: string): Promise<GroupMemberWithId[]> => {
      if (!loggedIn) return [];
      const repo = getRepository(true);
      return repo.getGroupMembersWithIds(groupId);
    },
    [loggedIn]
  );

  const createGroup = useCallback(
    async (name: string, currency = 'EUR', defaultBuyIn = '30', settlementMode = 'greedy') => {
      if (!loggedIn) throw new Error('Sign in to create groups');
      const repo = getRepository(true);
      const group = await repo.createGroup({ name, currency, default_buy_in: defaultBuyIn, settlement_mode: settlementMode });
      await loadGroups();
      return group;
    },
    [loggedIn, loadGroups]
  );

  const updateGroup = useCallback(
    async (params: { id: string; name?: string; currency?: string; default_buy_in?: string; settlement_mode?: string }) => {
      if (!loggedIn) throw new Error('Sign in to update groups');
      const repo = getRepository(true);
      const group = await repo.updateGroup(params);
      await loadGroups();
      return group;
    },
    [loggedIn, loadGroups]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!loggedIn) throw new Error('Sign in to delete groups');
      const repo = getRepository(true);
      await repo.deleteGroup(groupId);
      await loadGroups();
    },
    [loggedIn, loadGroups]
  );

  const addGroupMember = useCallback(
    async (groupId: string, userId: string) => {
      if (!loggedIn) throw new Error('Sign in to add members');
      const repo = getRepository(true);
      await repo.addGroupMember(groupId, userId);
      await loadGroups();
    },
    [loggedIn, loadGroups]
  );

  const removeGroupMember = useCallback(
    async (groupId: string, userId: string) => {
      if (!loggedIn) throw new Error('Sign in to remove members');
      const repo = getRepository(true);
      await repo.removeGroupMember(groupId, userId);
      await loadGroups();
    },
    [loggedIn, loadGroups]
  );

  const value: GroupsContextValue = {
    groups,
    loading,
    getGroupMembers,
    getGroupMembersWithIds,
    createGroup,
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
    reload: loadGroups,
    loggedIn,
  };

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): GroupsContextValue {
  const ctx = useContext(GroupsContext);
  if (ctx === undefined) throw new Error('useGroups must be used within GroupsProvider');
  return ctx;
}
