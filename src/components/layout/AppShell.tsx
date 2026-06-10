'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LeaderboardVisibilitySwitch } from '../settings/LeaderboardVisibilitySwitch';
import { SettingsModal } from '../settings/SettingsModal';
import { SignInModal } from './SignInModal';
import { SelectGroupModal } from '../payout/SelectGroupModal';
import { useSettings } from '@/hooks/useSettings';
import { useSelectGroupModal } from '@/hooks/useSelectGroupModal';
import { OPEN_SIGN_IN_EVENT } from '@/lib/constants';
import { IconLogOut, IconUser } from '@/components/ui/MenuIcons';

const PROFILE_ONBOARDING_KEY = 'chiphappens:profile_onboarding';

function initialsFromIdentity(profileName: string | undefined, email: string | undefined): string {
  const name = profileName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0].match(/[a-zA-Z0-9]/);
      const b = parts[parts.length - 1].match(/[a-zA-Z0-9]/);
      if (a && b) return (a[0] + b[0]).toUpperCase();
    }
    const letters = name.replace(/[^a-zA-Z0-9]/g, '');
    if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
    if (letters.length === 1) return letters.toUpperCase();
  }
  const em = email?.trim();
  if (em) {
    const local = em.split('@')[0] || '';
    const segments = local.split(/[._+-]/).filter(Boolean);
    if (segments.length >= 2) {
      const a = segments[0].match(/[a-zA-Z0-9]/);
      const b = segments[segments.length - 1].match(/[a-zA-Z0-9]/);
      if (a && b) return (a[0] + b[0]).toUpperCase();
    }
    const alnum = local.replace(/[^a-zA-Z0-9]/g, '');
    if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
    if (alnum.length === 1) return alnum.toUpperCase();
  }
  return '?';
}

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

  useEffect(() => {
    const handler = () => setSignInOpen(true);
    window.addEventListener(OPEN_SIGN_IN_EVENT, handler);
    return () => window.removeEventListener(OPEN_SIGN_IN_EVENT, handler);
  }, []);

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

  const avatarInitials = initialsFromIdentity(settings?.profile?.name, user?.email);

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
            type="button"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[#d4a832] text-[#18181b] shadow border-2 border-[#bfa12a] hover:brightness-110 focus:outline-none"
            onClick={() => setAccountMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={accountMenuOpen}
            aria-label={`Account menu, ${getDisplayName()}`}
            title={getDisplayName()}
          >
            <span
              className={`font-bold leading-none select-none tracking-tight ${
                avatarInitials.length === 1 ? 'text-lg' : 'text-sm'
              }`}
              aria-hidden="true"
            >
              {avatarInitials}
            </span>
          </button>
          {accountMenuOpen && (
            <div
              className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--color-outline)] bg-[#1a1a1f] text-[var(--color-accent)] shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-[1000]"
              role="menu"
            >
              <div className="border-b border-[var(--color-outline)] bg-[#232323] px-4 py-3 text-[15px] font-medium">
                {getDisplayName()}
              </div>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 border-b border-[var(--color-outline)] px-4 py-3 text-left text-[15px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[#23232a]"
                onClick={() => {
                  setProfileOpen(true);
                  setAccountMenuOpen(false);
                }}
              >
                <IconUser className="shrink-0" />
                <span className="whitespace-nowrap">Profile</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[#23232a]"
                onClick={async () => {
                  setAccountMenuOpen(false);
                  await signOut();
                }}
              >
                <IconLogOut className="shrink-0" />
                <span className="whitespace-nowrap">Sign Out</span>
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
  const { settings, updateProfile } = useSettings();
  const [name, setName] = useState(settings.profile.name);
  const [revtag, setRevtag] = useState(settings.profile.revtag || '@');
  const [leaderboardOptOut, setLeaderboardOptOut] = useState(settings.profile.leaderboardOptOut);
  useEffect(() => {
    setName(settings.profile.name);
    setRevtag(settings.profile.revtag || '@');
    setLeaderboardOptOut(settings.profile.leaderboardOptOut);
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
      leaderboardOptOut,
    });
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
          <p className="muted-text">Name and revtag sync to your account when signed in.</p>
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
            <LeaderboardVisibilitySwitch
              showInLeaderboards={!leaderboardOptOut}
              onShowInLeaderboardsChange={(show) => setLeaderboardOptOut(!show)}
            />
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
