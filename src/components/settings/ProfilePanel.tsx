'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/lib/auth/AuthProvider';
import { NotificationPrefsSection } from './NotificationPrefsSection';

export function ProfilePanel() {
  const { user } = useAuth();
  const { settings, closeSettingsModal, setActivePanel, updateProfile } = useSettings();
  const [name, setName] = useState('');
  const [revtag, setRevtag] = useState('');

  useEffect(() => {
    setName(settings.profile.name);
    setRevtag(settings.profile.revtag || '@');
  }, [settings.profile]);

  const formatRevtag = (v: string) => {
    const trimmed = v.trim();
    return trimmed || '@';
  };

  const normalizeRevtag = (v: string) => {
    const trimmed = v.trim();
    return trimmed === '@' ? '' : trimmed;
  };

  const handleSave = async () => {
    const ok = await updateProfile({
      name: name.trim(),
      revtag: normalizeRevtag(revtag),
    });
    if (ok) closeSettingsModal();
  };

  return (
    <div className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={closeSettingsModal} />
      <div className="modal-content" role="document">
        <div className="modal-header">
          <button
            className="modal-back"
            onClick={() => setActivePanel('hub')}
            aria-label="Back to settings"
          >
            <svg className="modal-back-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h2 className="modal-title">Profile</h2>
          <button className="modal-close" onClick={closeSettingsModal} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="muted-text">Profile settings are stored on this device.</p>
          <div className="settings-section">
            <label className="settings-field">
              <span className="settings-label">Name</span>
              <input
                className="input-field"
                type="text"
                placeholder="Your name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Revtag</span>
              <input
                className="input-field"
                type="text"
                placeholder="e.g. @yourtag"
                value={revtag}
                onChange={(e) => setRevtag(e.target.value)}
                onBlur={() => setRevtag(formatRevtag(revtag))}
              />
            </label>
          </div>
          {user ? <NotificationPrefsSection /> : null}
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
