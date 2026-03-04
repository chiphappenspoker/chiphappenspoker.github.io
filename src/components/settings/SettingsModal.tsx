'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { ProfilePanel } from './ProfilePanel';
import { GroupsPanel } from './GroupsPanel';
import { GameDefaultsPanel } from './GameDefaultsPanel';

export function SettingsModal() {
  const {
    settingsModalOpen,
    activePanel,
    closeSettingsModal,
    setActivePanel,
    importSettings,
    exportSettings,
  } = useSettings();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettingsModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeSettingsModal]);

  if (!settingsModalOpen) return null;

  return (
    <>
      {/* Hub */}
      {activePanel === 'hub' && (
        <div className="modal active" role="dialog" aria-modal="true">
          <div className="modal-overlay" onClick={closeSettingsModal} />
          <div className="modal-content" role="document">
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <button className="modal-close" onClick={closeSettingsModal} aria-label="Close settings">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="muted-text">Choose a settings category.</p>
              <div className="settings-list">
                <button className="settings-item-btn" onClick={() => setActivePanel('groups')}>
                  <span>Groups</span>
                  <span className="settings-item-meta">Create groups, add members (player list per session)</span>
                </button>
                <button className="settings-item-btn" onClick={() => setActivePanel('gameDefaults')}>
                  <span>Game Defaults</span>
                  <span className="settings-item-meta">Currency, Buy-in, Settlement</span>
                </button>
              </div>
              <div className="settings-actions settings-actions-split">
                <button className="btn btn-secondary settings-action-btn" onClick={importSettings}>
                  <svg className="settings-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v10" />
                    <path d="M7 9l5 5 5-5" />
                    <path d="M5 20h14" />
                  </svg>
                  <span>Import</span>
                </button>
                <button className="btn btn-secondary settings-action-btn" onClick={exportSettings}>
                  <svg className="settings-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21V11" />
                    <path d="M7 15l5-5 5 5" />
                    <path d="M5 4h14" />
                  </svg>
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePanel === 'profile' && <ProfilePanel />}
      {activePanel === 'groups' && <GroupsPanel />}
      {activePanel === 'gameDefaults' && <GameDefaultsPanel />}
    </>
  );
}
