'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useEntitlements } from '@/lib/entitlements/EntitlementsProvider';
import { BASE_PATH, getSiteOrigin } from '@/lib/constants';
import { getRepository } from '@/lib/data/sync-repository';
import { getGroupLeaderboard } from '@/lib/data/stats';
import { fmt } from '@/lib/calc/formatting';
import type { DbGameSession, LeaderboardRow } from '@/lib/types';

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const SETTLEMENT_MODES = [
  { value: 'greedy', label: 'Peer-to-peer (fewer transactions)' },
  { value: 'banker', label: 'Banker (collect & distribute)' },
] as const;

function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

function formatSessionDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function GroupsPanel() {
  const { closeSettingsModal, setActivePanel, initialGroupsView, setInitialGroupsView } = useSettings();
  const { user } = useAuth();
  const { flags, loading: entitlementsLoading, openUpgradeModal } = useEntitlements();
  const {
    groups,
    loading,
    loggedIn,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupMembersWithIds,
    removeGroupMember,
    reload: reloadGroups,
  } = useGroups();

  const [view, setView] = useState<'list' | 'new' | 'edit'>('list');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const editingGroup = useMemo(
    () => (editingGroupId ? groups.find((g) => g.id === editingGroupId) ?? null : null),
    [editingGroupId, groups]
  );

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [defaultBuyIn, setDefaultBuyIn] = useState('30');
  const [settlementMode, setSettlementMode] = useState<'greedy' | 'banker'>('greedy');
  const [members, setMembers] = useState<{ name: string; revtag: string; user_id: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [recentSessions, setRecentSessions] = useState<DbGameSession[]>([]);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  type SubModal = 'settings' | 'players' | 'recent-games' | 'leaderboard' | 'invite' | null;
  const [subModal, setSubModal] = useState<SubModal>(null);

  const isCreator = useMemo(
    () => Boolean(editingGroup && user && editingGroup.created_by === user.id),
    [editingGroup, user]
  );

  const resetFormToDefaults = useCallback(() => {
    setName('');
    setCurrency('EUR');
    setDefaultBuyIn('30');
    setSettlementMode('greedy');
    setMembers([]);
    setDeleteConfirm(false);
    setLeaveConfirm(false);
    setError(null);
  }, []);

  const loadMembers = useCallback(async () => {
    if (!editingGroupId) return;
    const list = await getGroupMembersWithIds(editingGroupId);
    setMembers(list);
  }, [editingGroupId, getGroupMembersWithIds]);

  useEffect(() => {
    if (view === 'new') {
      resetFormToDefaults();
      return;
    }
    if (view === 'edit' && editingGroup) {
      setName(editingGroup.name);
      setCurrency(editingGroup.currency ?? 'EUR');
      setDefaultBuyIn(editingGroup.default_buy_in ?? '30');
      setSettlementMode((editingGroup.settlement_mode === 'banker' ? 'banker' : 'greedy') as 'greedy' | 'banker');
    }
  }, [view, editingGroup, resetFormToDefaults]);

  useEffect(() => {
    if (view === 'edit') {
      loadMembers().catch(() => setMembers([]));
    }
  }, [view, loadMembers]);

  useEffect(() => {
    if (view !== 'edit') setSubModal(null);
  }, [view]);

  useEffect(() => {
    if (view !== 'edit' || !editingGroupId || !user) {
      setRecentSessions([]);
      setLeaderboardRows([]);
      return;
    }
    let cancelled = false;
    setLoadingSessions(true);
    setLoadingLeaderboard(true);
    const repo = getRepository(!!user);
    repo
      .getGameSessionsForUser({ groupId: editingGroupId })
      .then((sessions) => {
        if (cancelled) return;
        const sorted = [...sessions].sort(
          (a, b) => (b.session_date > a.session_date ? 1 : b.session_date < a.session_date ? -1 : 0)
        );
        setRecentSessions(sorted.slice(0, 10));
      })
      .catch(() => {
        if (!cancelled) setRecentSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    getGroupLeaderboard(editingGroupId)
      .then((rows) => {
        if (!cancelled) setLeaderboardRows(rows.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setLeaderboardRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLeaderboard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, editingGroupId, user]);

  // When opened via "Create group" from Select group modal, show New group form
  useEffect(() => {
    if (initialGroupsView === 'new') {
      setView('new');
      setEditingGroupId(null);
      setInitialGroupsView(null);
    }
  }, [initialGroupsView, setInitialGroupsView]);

  const goToList = () => {
    setView('list');
    setEditingGroupId(null);
    setError(null);
  };

  const openNewGroup = () => {
    setView('new');
    setEditingGroupId(null);
  };

  const openGroupManagement = (groupId: string) => {
    setEditingGroupId(groupId);
    setView('edit');
  };

  const handleBack = () => {
    if (view !== 'list') {
      goToList();
    } else {
      setActivePanel('hub');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createGroup(name.trim(), currency, defaultBuyIn, settlementMode);
      goToList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroupId) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateGroup({
        id: editingGroupId,
        name: name.trim(),
        currency,
        default_buy_in: defaultBuyIn,
        settlement_mode: settlementMode,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!editingGroupId) return;
    setSubmitting(true);
    setError(null);
    try {
      await removeGroupMember(editingGroupId, userId);
      loadMembers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!editingGroupId || !deleteConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteGroup(editingGroupId);
      goToList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!editingGroupId || !user || !leaveConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      await removeGroupMember(editingGroupId, user.id);
      await reloadGroups();
      goToList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = view === 'list' ? 'Groups' : view === 'new' ? 'New group' : (editingGroup?.name ?? 'Group');

  if (!loggedIn || !user) {
    return (
      <div className="modal active" role="dialog" aria-modal="true">
        <div className="modal-overlay" onClick={closeSettingsModal} />
        <div className="modal-content" role="document">
          <div className="modal-header">
            <button className="modal-back" onClick={() => setActivePanel('hub')} aria-label="Back to settings">
              <svg className="modal-back-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <h2 className="modal-title">Groups</h2>
            <button className="modal-close" onClick={closeSettingsModal} aria-label="Close">✕</button>
          </div>
          <div className="modal-body">
            <p className="muted-text">Sign in to create and manage groups. Group members are used as the player list when you select a group for a game session.</p>
          </div>
        </div>
      </div>
    );
  }

  if (entitlementsLoading) {
    return (
      <div className="modal active" role="dialog" aria-modal="true">
        <div className="modal-overlay" onClick={closeSettingsModal} />
        <div className="modal-content" role="document">
          <div className="modal-header">
            <button className="modal-back" onClick={() => setActivePanel('hub')} aria-label="Back to settings">
              <svg className="modal-back-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <h2 className="modal-title">Groups</h2>
            <button className="modal-close" onClick={closeSettingsModal} aria-label="Close">✕</button>
          </div>
          <div className="modal-body">
            <p className="muted-text">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!flags.canGroups) {
    return (
      <div className="modal active" role="dialog" aria-modal="true">
        <div className="modal-overlay" onClick={closeSettingsModal} />
        <div className="modal-content" role="document">
          <div className="modal-header">
            <button className="modal-back" onClick={() => setActivePanel('hub')} aria-label="Back to settings">
              <svg className="modal-back-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <h2 className="modal-title">Groups</h2>
            <button className="modal-close" onClick={closeSettingsModal} aria-label="Close">✕</button>
          </div>
          <div className="modal-body text-center">
            <p className="muted-text mb-4">
              Creating and managing groups is part of ChipHappens Pro (one-time unlock). Billing is coming soon.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openUpgradeModal()}>
              Learn about Pro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={closeSettingsModal} />
      <div className="modal-content" role="document">
        <div className="modal-header">
          <button className="modal-back" onClick={handleBack} aria-label={view === 'list' ? 'Back to settings' : 'Back to groups'}>
            <svg className="modal-back-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h2 className="modal-title">{modalTitle}</h2>
          <button className="modal-close" onClick={closeSettingsModal} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          {view === 'list' && (
            <>
              <p className="muted-text mb-4">Create groups and add members.</p>
              {loading && <p className="muted-text mb-4">Loading groups…</p>}
              <button type="button" className="btn btn-primary w-full mb-4" onClick={openNewGroup}>
                ➕ Create group
              </button>
              <div className="settings-list">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="settings-item-btn w-full text-left flex items-center justify-between"
                    onClick={() => openGroupManagement(g.id)}
                  >
                    <span>{g.name}</span>
                    <span className="settings-item-meta">Edit</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'new' && (
            <form onSubmit={handleCreate} className="space-y-4">
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <label className="settings-field block">
                <span className="settings-label">Group name</span>
                <input className="input-field w-full" type="text" placeholder="e.g. Friday game" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="settings-field block">
                <span className="settings-label">Currency</span>
                <select className="input-field w-full" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="settings-field block">
                <span className="settings-label">Default buy-in</span>
                <input className="input-field w-full" type="text" value={defaultBuyIn} onChange={(e) => setDefaultBuyIn(e.target.value)} />
              </label>
              <label className="settings-field block">
                <span className="settings-label">Settlement mode</span>
                <select className="input-field w-full" value={settlementMode} onChange={(e) => setSettlementMode(e.target.value as 'greedy' | 'banker')}>
                  {SETTLEMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
                  {submitting ? 'Creating…' : 'Create group'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={goToList}>Cancel</button>
              </div>
            </form>
          )}

          {view === 'edit' && editingGroup && (
            <div className="space-y-6">
              {error && <div className="text-red-500 text-sm">{error}</div>}

              {!isCreator ? (
                <>
                  <section>
                    <h3 className="font-semibold mb-2">{editingGroup.name}</h3>
                    <p className="text-sm muted-text mb-2">You are a member of this group. Members appear in the player list when this group is selected.</p>
                  </section>
                  <section>
                    <ul className="list-none p-0 m-0 space-y-1">
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('players')}>
                          Players
                        </button>
                      </li>
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('recent-games')}>
                          Recent games
                        </button>
                      </li>
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('leaderboard')}>
                          Leaderboard
                        </button>
                      </li>
                    </ul>
                  </section>
                  <section className="pt-3 border-t border-[var(--color-outline)]">
                    <h3 className="font-semibold mb-2">Leave group</h3>
                    <p className="text-sm muted-text mb-2">You will no longer see this group or its players in the app.</p>
                    {!leaveConfirm ? (
                      <button type="button" className="btn btn-secondary" onClick={() => setLeaveConfirm(true)}>
                        Leave group
                      </button>
                    ) : (
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-sm">Leave this group?</span>
                        <button type="button" className="btn btn-primary" onClick={handleLeaveGroup} disabled={submitting}>
                          {submitting ? 'Leaving…' : 'Yes, leave'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setLeaveConfirm(false)} disabled={submitting}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <ul className="list-none p-0 m-0 space-y-1">
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('settings')}>
                          Group settings
                        </button>
                      </li>
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('players')}>
                          Players
                        </button>
                      </li>
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('recent-games')}>
                          Recent games
                        </button>
                      </li>
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('leaderboard')}>
                          Leaderboard
                        </button>
                      </li>
                      <li>
                        <button type="button" className="btn btn-secondary w-full text-left" onClick={() => setSubModal('invite')}>
                          Invitation link
                        </button>
                      </li>
                    </ul>
                  </section>

                  <section className="pt-3 border-t border-panel">
                    <h3 className="font-semibold mb-2 text-red-600 dark:text-red-400">Danger zone</h3>
                    <p className="text-sm muted-text mb-2">Deleting this group cannot be undone.</p>
                    {!deleteConfirm ? (
                      <button type="button" className="btn btn-secondary text-red-600 dark:text-red-400 border-red-600/50" onClick={() => setDeleteConfirm(true)}>
                        Delete group
                      </button>
                    ) : (
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-sm">Are you sure?</span>
                        <button type="button" className="btn btn-primary bg-red-600 hover:bg-red-700" onClick={handleDeleteGroup} disabled={submitting}>
                          {submitting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirm(false)} disabled={submitting}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {view === 'edit' && editingGroup && subModal && (
            <div className="modal active" role="dialog" aria-modal="true" aria-labelledby="group-submodal-title">
              <div className="modal-overlay" onClick={() => setSubModal(null)} />
              <div className="modal-content" role="document">
                <div className="modal-header">
                  <button type="button" className="modal-back" onClick={() => setSubModal(null)} aria-label="Back to group">
                    <svg className="modal-back-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 5l-7 7 7 7" />
                    </svg>
                  </button>
                  <h2 id="group-submodal-title" className="modal-title">
                    {subModal === 'settings' && 'Group settings'}
                    {subModal === 'players' && 'Players'}
                    {subModal === 'recent-games' && 'Recent games'}
                    {subModal === 'leaderboard' && 'Leaderboard'}
                    {subModal === 'invite' && 'Invitation link'}
                  </h2>
                  <button type="button" className="modal-close" onClick={() => setSubModal(null)} aria-label="Close">✕</button>
                </div>
                <div className="modal-body">
                  {subModal === 'settings' && (
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveSettings(e).then(() => setSubModal(null)).catch(() => {}); }} className="space-y-3">
                      <label className="settings-field block">
                        <span className="settings-label">Name</span>
                        <input className="input-field w-full" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                      </label>
                      <label className="settings-field block">
                        <span className="settings-label">Currency</span>
                        <select className="input-field w-full" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className="settings-field block">
                        <span className="settings-label">Default buy-in</span>
                        <input className="input-field w-full" type="text" value={defaultBuyIn} onChange={(e) => setDefaultBuyIn(e.target.value)} />
                      </label>
                      <label className="settings-field block">
                        <span className="settings-label">Settlement mode</span>
                        <select className="input-field w-full" value={settlementMode} onChange={(e) => setSettlementMode(e.target.value as 'greedy' | 'banker')}>
                          {SETTLEMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </label>
                      <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save settings'}</button>
                    </form>
                  )}
                  {subModal === 'players' && (
                    <>
                      {isCreator && <p className="text-sm muted-text mb-3">Members appear in the &quot;usual suspects&quot; list when this group is selected.</p>}
                      {!isCreator && <p className="text-sm muted-text mb-3">You are a member of this group.</p>}
                      {members.length === 0 ? (
                        <p className="text-sm muted-text">No members yet.</p>
                      ) : (
                        <ul className="list-none p-0 m-0 space-y-1">
                          {members.map((m) => {
                            const role = m.user_id === editingGroup.created_by ? 'owner' : 'member';
                            return (
                              <li key={m.user_id} className="flex items-center justify-between gap-2 min-h-[36px] py-0 px-2 rounded-md bg-[rgba(255,255,255,0.04)] border border-[var(--color-outline)] text-sm leading-tight">
                                <span className="truncate min-w-0">{m.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs px-2 py-0.5 rounded muted-text bg-[rgba(255,255,255,0.06)]">{role}</span>
                                  {isCreator && role === 'member' && (
                                    <button type="button" className="w-5 h-5 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.1)] muted-text hover:text-[var(--color-text)] text-sm" onClick={() => handleRemoveMember(m.user_id)} disabled={submitting} aria-label={`Remove ${m.name}`}>
                                      ×
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                  {subModal === 'recent-games' && (
                    <>
                      {loadingSessions ? (
                        <p className="text-sm muted-text">Loading…</p>
                      ) : recentSessions.length === 0 ? (
                        <p className="text-sm muted-text">No sessions yet.</p>
                      ) : (
                        <ul className="list-none p-0 m-0 space-y-1">
                          {recentSessions.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-2 min-h-[36px] py-0 px-2 rounded-md bg-[rgba(255,255,255,0.04)] border border-[var(--color-outline)] text-sm leading-tight">
                              <span className="truncate min-w-0">{formatSessionDateTime(s.created_at || `${s.session_date}T00:00:00`)}</span>
                              <Link href={`${BASE_PATH}/history?sessionId=${s.id}`} className="shrink-0 text-sm text-[var(--color-link)] hover:underline" onClick={() => setSubModal(null)}>
                                View
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {subModal === 'leaderboard' && (
                    <>
                      {loadingLeaderboard ? (
                        <p className="text-sm muted-text">Loading…</p>
                      ) : leaderboardRows.length === 0 ? (
                        <p className="text-sm muted-text">No data yet.</p>
                      ) : (
                        <>
                          <ul className="list-none p-0 m-0 mb-3 space-y-1">
                            {leaderboardRows.map((r) => (
                              <li key={r.user_id} className="flex items-center justify-between gap-2 min-h-[36px] py-0 px-2 rounded-md bg-[rgba(255,255,255,0.04)] border border-[var(--color-outline)] text-sm leading-tight">
                                <span className="truncate min-w-0">{r.display_name || '—'}</span>
                                <span className="shrink-0 text-sm">{fmt(r.total_profit)}{editingGroup?.currency ? ` ${editingGroup.currency}` : ''}</span>
                              </li>
                            ))}
                          </ul>
                          <Link href={`${BASE_PATH}/leaderboard`} className="text-sm text-[var(--color-link)] hover:underline" onClick={() => setSubModal(null)}>
                            View full leaderboard
                          </Link>
                        </>
                      )}
                    </>
                  )}
                  {subModal === 'invite' && editingGroupId && editingGroup && (
                    <>
                      <p className="text-sm muted-text mb-3">Share this link so others can join the group. Anyone with the link can join if they are signed in.</p>
                      {typeof window !== 'undefined' && (
                        <div className="flex gap-2 items-center flex-wrap">
                          <input
                            readOnly
                            type="text"
                            className="input-field flex-1 min-w-0 font-mono text-sm"
                            value={editingGroup.invite_code
                              ? `${getSiteOrigin()}${BASE_PATH}/join?code=${encodeURIComponent(editingGroup.invite_code)}`
                              : `${getSiteOrigin()}${BASE_PATH}/invite?group=${editingGroupId}&name=${encodeURIComponent(editingGroup.name)}`}
                            aria-label="Group invitation link"
                          />
                          <button
                            type="button"
                            className="btn btn-primary whitespace-nowrap"
                            onClick={async () => {
                              const url = editingGroup.invite_code
                                ? `${getSiteOrigin()}${BASE_PATH}/join?code=${encodeURIComponent(editingGroup.invite_code)}`
                                : `${getSiteOrigin()}${BASE_PATH}/invite?group=${editingGroupId}&name=${encodeURIComponent(editingGroup.name)}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                setCopiedInvite(true);
                                setTimeout(() => setCopiedInvite(false), 2000);
                              } catch {
                                const el = document.querySelector<HTMLInputElement>('input[aria-label="Group invitation link"]');
                                el?.select();
                              }
                            }}
                          >
                            {copiedInvite ? 'Copied!' : 'Copy link'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
