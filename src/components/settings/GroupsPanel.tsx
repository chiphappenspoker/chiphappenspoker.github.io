'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/lib/auth/AuthProvider';
import { BASE_PATH } from '@/lib/constants';

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const SETTLEMENT_MODES = [
  { value: 'greedy', label: 'Peer-to-peer (fewer transactions)' },
  { value: 'banker', label: 'Banker (collect & distribute)' },
] as const;

export function GroupsPanel() {
  const { closeSettingsModal, setActivePanel } = useSettings();
  const { user } = useAuth();
  const {
    groups,
    loading,
    loggedIn,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupMembersWithIds,
    addGroupMember,
    removeGroupMember,
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
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const resetFormToDefaults = useCallback(() => {
    setName('');
    setCurrency('EUR');
    setDefaultBuyIn('30');
    setSettlementMode('greedy');
    setMembers([]);
    setAddMemberUserId('');
    setDeleteConfirm(false);
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

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = addMemberUserId.trim();
    if (!uid || !editingGroupId) return;
    setSubmitting(true);
    setError(null);
    try {
      await addGroupMember(editingGroupId, uid);
      setAddMemberUserId('');
      loadMembers();
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
                Create group
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

              <section>
                <h3 className="font-semibold mb-2">Group settings</h3>
                <form onSubmit={handleSaveSettings} className="space-y-3">
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
              </section>

              <section>
                <h3 className="font-semibold mb-2">Players</h3>
                <p className="text-sm muted-text mb-2">Members appear in the "usual suspects" list when this group is selected.</p>
                {members.length === 0 ? (
                  <p className="text-sm muted-text mb-2">No members yet.</p>
                ) : (
                  <ul className="settings-list mb-3">
                    {members.map((m) => (
                      <li key={m.user_id} className="settings-item-btn flex items-center justify-between gap-2">
                        <span>{m.name}</span>
                        <button type="button" className="btn btn-secondary text-sm" onClick={() => handleRemoveMember(m.user_id)} disabled={submitting} aria-label={`Remove ${m.name}`}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={handleAddMember} className="flex gap-2 flex-wrap items-center">
                  <input className="input-field flex-1 min-w-0" type="text" placeholder="User ID (UUID) to add" value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)} />
                  <button type="submit" className="btn btn-primary" disabled={submitting || !addMemberUserId.trim()}>
                    Add player
                  </button>
                </form>
              </section>

              <section>
                <h3 className="font-semibold mb-2">Invitation link</h3>
                <p className="text-sm muted-text mb-2">Share this link so others can join the group. Anyone with the link can join if they are signed in.</p>
                {typeof window !== 'undefined' && editingGroupId && editingGroup && (
                  <div className="flex gap-2 items-center flex-wrap">
                    <input
                      readOnly
                      type="text"
                      className="input-field flex-1 min-w-0 font-mono text-sm"
                      value={`${window.location.origin}${BASE_PATH}/invite?group=${editingGroupId}&name=${encodeURIComponent(editingGroup.name)}`}
                      aria-label="Group invitation link"
                    />
                    <button
                      type="button"
                      className="btn btn-primary whitespace-nowrap"
                      onClick={async () => {
                        const url = `${window.location.origin}${BASE_PATH}/invite?group=${editingGroupId}&name=${encodeURIComponent(editingGroup.name)}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 2000);
                        } catch {
                          // fallback: select the input so user can copy manually
                          const el = document.querySelector<HTMLInputElement>('input[aria-label="Group invitation link"]');
                          el?.select();
                        }
                      }}
                    >
                      {copiedInvite ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>
                )}
              </section>

              <section>
                <h3 className="font-semibold mb-2">Roles</h3>
                <p className="text-sm muted-text">All members are players. Role-based permissions can be added later.</p>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
