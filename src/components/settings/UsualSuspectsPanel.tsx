'use client';

import { useState, useEffect } from 'react';
import { UsualSuspect } from '@/lib/types';
import { compareByFirstName } from '@/lib/names';
import { useSettings } from '@/hooks/useSettings';

export function UsualSuspectsPanel() {
  const { settings, closeSettingsModal, setActivePanel, updateUsualSuspects } = useSettings();
  const [suspects, setSuspects] = useState<UsualSuspect[]>([]);

  useEffect(() => {
    const sorted = [...settings.usualSuspects].sort((a, b) =>
      compareByFirstName(a.name, b.name)
    );
    setSuspects(sorted.length > 0 ? sorted : [{ name: '', revtag: '' }]);
  }, [settings.usualSuspects]);

  const formatRevtag = (v: string) => {
    const trimmed = v.trim();
    return trimmed || '@';
  };

  const normalizeRevtag = (v: string) => {
    const trimmed = v.trim();
    return trimmed === '@' ? '' : trimmed;
  };

  const updateSuspect = (index: number, field: 'name' | 'revtag', value: string) => {
    setSuspects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeSuspect = (index: number) => {
    setSuspects((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ name: '', revtag: '' }];
    });
  };

  const addSuspect = () => {
    setSuspects((prev) => [...prev, { name: '', revtag: '' }]);
  };

  const handleSave = async () => {
    const cleaned = suspects
      .map((s) => ({
        name: s.name.trim(),
        revtag: normalizeRevtag(s.revtag),
      }))
      .filter((s) => s.name)
      .sort((a, b) => compareByFirstName(a.name, b.name));
    const ok = await updateUsualSuspects(cleaned);
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
          <h2 className="modal-title">Usual Suspects</h2>
          <button className="modal-close" onClick={closeSettingsModal} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="muted-text">Add players for quick access in the calculator.</p>
          <div className="settings-table-wrapper">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Revtag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suspects.map((suspect, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="input-field"
                        type="text"
                        placeholder="Name"
                        value={suspect.name}
                        onChange={(e) => updateSuspect(i, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="input-field"
                        type="text"
                        placeholder="Revtag"
                        value={formatRevtag(suspect.revtag)}
                        onChange={(e) => updateSuspect(i, 'revtag', e.target.value)}
                        onBlur={() => updateSuspect(i, 'revtag', formatRevtag(suspect.revtag))}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete-btn"
                        aria-label="Delete suspect"
                        onClick={() => removeSuspect(i)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="settings-actions settings-actions-split">
            <button className="btn btn-secondary" onClick={addSuspect}>
              ➕ Add
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
