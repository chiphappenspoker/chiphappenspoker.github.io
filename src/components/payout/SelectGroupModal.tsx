'use client';

import { useGroups } from '@/hooks/useGroups';
import { useSettings } from '@/hooks/useSettings';
import { getLocalStorage, setLocalStorage } from '@/lib/storage/local-storage';
import { PAYOUT_STORAGE_KEY, SELECTED_GROUP_CHANGED_EVENT } from '@/lib/constants';

interface SelectGroupModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when user selects a group (not "No group"). */
  onGroupSelected?: () => void;
}

export function SelectGroupModal({ open, onClose, onGroupSelected }: SelectGroupModalProps) {
  const { groups, loggedIn } = useGroups();
  const { openSettingsToNewGroup } = useSettings();

  const handleCreateGroup = () => {
    onClose();
    openSettingsToNewGroup();
  };
  const saved = typeof window !== 'undefined' ? getLocalStorage<{ selectedGroupId?: string }>(PAYOUT_STORAGE_KEY) : null;
  const currentId = saved?.selectedGroupId ?? '';

  const handleSelect = (groupId: string | null) => {
    const existing = getLocalStorage<Record<string, unknown>>(PAYOUT_STORAGE_KEY);
    const next = existing ? { ...existing, selectedGroupId: groupId ?? undefined } : { selectedGroupId: groupId ?? undefined };
    setLocalStorage(PAYOUT_STORAGE_KEY, next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SELECTED_GROUP_CHANGED_EVENT, { detail: { selectedGroupId: groupId } }));
    }
    if (groupId) onGroupSelected?.();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal active" role="dialog" aria-modal="true" aria-labelledby="select-group-title">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content" role="document">
        <div className="modal-header">
          <h2 id="select-group-title" className="modal-title">Select Group</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <p className="muted-text mb-4">
            Choose a group for this session. Group members will appear in the "Usual Suspects" list.
          </p>
          {!loggedIn && (
            <p className="muted-text mb-4">Sign in to create and use groups.</p>
          )}
          <div className="flex flex-col gap-2">
            {loggedIn && (
              <button
                type="button"
                className="btn btn-secondary w-full text-left"
                onClick={handleCreateGroup}
              >
                ➕ Create group
              </button>
            )}
            <button
              type="button"
              className={`btn w-full text-left ${!currentId ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleSelect(null)}
            >
              No group
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`btn w-full text-left ${currentId === g.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleSelect(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
