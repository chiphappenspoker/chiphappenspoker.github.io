'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ProfilePanel } from '../settings/ProfilePanel';

import { SettingsModal } from '../settings/SettingsModal';
import { SignInModal } from './SignInModal';
import { SelectGroupModal } from '../payout/SelectGroupModal';
import { useSettings } from '@/hooks/useSettings';
import { useSelectGroupModal } from '@/hooks/useSelectGroupModal';

const PROFILE_ONBOARDING_KEY = 'chiphappens:profile_onboarding';

export function AppShell({ children }: { children: React.ReactNode }) {

  const [signInOpen, setSignInOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const { settings } = useSettings();
  const { openSelectGroupModal, setOpenSelectGroupModal, notifyGroupSelected, clearGroupSelectedCallback } = useSelectGroupModal();

  // After first sign-in, open profile modal so user can set name and revtag
  useEffect(() => {
    if (!user?.id) return;
    const key = `${PROFILE_ONBOARDING_KEY}:${user.id}`;
    try {
      if (typeof window !== 'undefined' && !window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, '1');
        setProfileOpen(true);
      }
    } catch {
      /* ignore localStorage errors */
    }
  }, [user?.id]);

  // Close account menu on outside click
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accountMenuOpen]);

  // Helper to get display name (local profile name or fallback to email)

  function getDisplayName() {
    if (settings?.profile?.name?.trim()) return settings.profile.name;
    return user?.email || 'Account';
  }

  return (
    <>
      {!user && (
        <button
          className="fixed top-3 right-3 z-50 bg-[#d4a832] text-[#18181b] px-3 py-1 rounded shadow"
          onClick={() => setSignInOpen(true)}
        >
          Sign In
        </button>
      )}
      {user && (
        <div ref={accountMenuRef} className="fixed top-3 right-3 z-50">
          <button
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[#d4a832] text-[#18181b] shadow border-2 border-[#bfa12a] hover:brightness-110 focus:outline-none"
            onClick={() => setAccountMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={accountMenuOpen}
            title="Account"
          >
            {/* Poker chip avatar SVG */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="14" cy="14" r="13" fill="#fff" stroke="#18181b" strokeWidth="2"/>
              <circle cx="14" cy="14" r="8" fill="#d4a832" stroke="#18181b" strokeWidth="2"/>
              <circle cx="14" cy="14" r="4" fill="#fff" stroke="#18181b" strokeWidth="1.5"/>
              <g stroke="#18181b" strokeWidth="2">
                <line x1="14" y1="1" x2="14" y2="5" />
                <line x1="14" y1="23" x2="14" y2="27" />
                <line x1="1" y1="14" x2="5" y2="14" />
                <line x1="23" y1="14" x2="27" y2="14" />
                <line x1="5.8" y1="5.8" x2="8.6" y2="8.6" />
                <line x1="19.4" y1="19.4" x2="22.2" y2="22.2" />
                <line x1="5.8" y1="22.2" x2="8.6" y2="19.4" />
                <line x1="19.4" y1="8.6" x2="22.2" y2="5.8" />
              </g>
            </svg>
          </button>
          {accountMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#18181b] text-white rounded shadow-lg border border-[#333] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#333] text-sm font-semibold bg-[#232323]">
                {/* Show user's name if available, else email */}
                {getDisplayName()}
              </div>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-[#232323]"
                onClick={() => {
                  setProfileOpen(true);
                  setAccountMenuOpen(false);
                }}
              >
                Profile
              </button>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-[#232323]"
                onClick={async () => {
                  setAccountMenuOpen(false);
                  await signOut();
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
      {profileOpen && <ProfilePanelWrapper onClose={() => setProfileOpen(false)} />}
      <SelectGroupModal
        open={openSelectGroupModal}
        onClose={() => {
          clearGroupSelectedCallback();
          setOpenSelectGroupModal(false);
        }}
        onGroupSelected={notifyGroupSelected}
      />
      {children}
      <SettingsModal />
    </>
  );

// Wrapper to allow closing ProfilePanel from account menu
function ProfilePanelWrapper({ onClose }: { onClose: () => void }) {
  // Patch ProfilePanel to call onClose instead of closeSettingsModal
  // We'll override closeSettingsModal prop via context
  // This is a hack, but works for now
  const { settings, setActivePanel, updateProfile } = require('@/hooks/useSettings').useSettings();
  const [name, setName] = useState(settings.profile.name);
  const [revtag, setRevtag] = useState(settings.profile.revtag || '@');
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
    const ok = await updateProfile({ name: name.trim(), revtag: normalizeRevtag(revtag) });
    if (ok) onClose();
  };
  return (
    <div className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content" role="document">
        <div className="modal-header">
          <h2 className="modal-title">Profile</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
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
}
