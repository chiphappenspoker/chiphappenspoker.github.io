'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { SettingsData, UsualSuspect } from '@/lib/types';
import {
  normalizeSettingsData,
  loadSettingsData,
  saveSettingsData,
} from '@/lib/storage/settings-store';
import { useToast } from './useToast';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getRepository } from '@/lib/data/sync-repository';
import { SETTINGS_MODAL_CLOSED_EVENT } from '@/lib/constants';

type SettingsPanel = 'hub' | 'profile' | 'groups' | 'gameDefaults' | null;

export type GroupsInitialView = 'list' | 'new' | null;

interface SettingsContextValue {
  settings: SettingsData;
  settingsModalOpen: boolean;
  activePanel: SettingsPanel;
  initialGroupsView: GroupsInitialView;
  setInitialGroupsView: (view: GroupsInitialView) => void;
  openSettingsModal: () => void;
  openSettingsToNewGroup: () => void;
  closeSettingsModal: () => void;
  setActivePanel: (panel: SettingsPanel) => void;
  updateProfile: (profile: SettingsData['profile']) => Promise<boolean>;
  updateUsualSuspects: (suspects: UsualSuspect[]) => Promise<boolean>;
  updateGameSettings: (gs: SettingsData['gameSettings']) => Promise<boolean>;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const EMPTY_SUSPECTS: UsualSuspect[] = [];
const defaultSettings: SettingsData = {
  profile: { name: '', revtag: '' },
  usualSuspects: EMPTY_SUSPECTS,
  gameSettings: { currency: 'EUR', defaultBuyIn: '30', settlementMode: 'banker' },
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<SettingsPanel>(null);
  const [initialGroupsView, setInitialGroupsView] = useState<GroupsInitialView>(null);
  const { showToast } = useToast();
  const { user } = useAuth();
  const loggedIn = !!user;

  const loadAndSetSettings = useCallback(async () => {
    try {
      if (loggedIn) {
        const repo = getRepository(true);
        const data = await repo.getSettings();
        setSettings(data ? normalizeSettingsData(data, EMPTY_SUSPECTS) : defaultSettings);
      } else {
        const raw = await loadSettingsData();
        setSettings(normalizeSettingsData(raw, EMPTY_SUSPECTS));
      }
    } catch {
      setSettings(normalizeSettingsData(null, EMPTY_SUSPECTS));
    }
  }, [loggedIn]);

  useEffect(() => {
    loadAndSetSettings();
  }, [loadAndSetSettings]);

  const openSettingsModal = useCallback(() => {
    setActivePanel('hub');
    setInitialGroupsView(null);
    setSettingsModalOpen(true);
  }, []);

  const openSettingsToNewGroup = useCallback(() => {
    setActivePanel('groups');
    setInitialGroupsView('new');
    setSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalOpen(false);
    setActivePanel(null);
    setInitialGroupsView(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SETTINGS_MODAL_CLOSED_EVENT));
    }
  }, []);

  const updateProfile = useCallback(
    async (profile: SettingsData['profile']): Promise<boolean> => {
      try {
        const updated = { ...settings, profile };
        if (loggedIn) await getRepository(true).saveSettings(updated);
        else await saveSettingsData(updated);
        setSettings(updated);
        showToast('Profile saved');
        return true;
      } catch {
        showToast('Unable to save profile');
        return false;
      }
    },
    [settings, showToast, loggedIn]
  );

  const updateUsualSuspects = useCallback(
    async (usualSuspects: UsualSuspect[]): Promise<boolean> => {
      try {
        const updated = { ...settings, usualSuspects };
        if (loggedIn) await getRepository(true).saveSettings(updated);
        else await saveSettingsData(updated);
        setSettings(updated);
        showToast('Usual suspects saved');
        return true;
      } catch {
        showToast('Unable to save usual suspects');
        return false;
      }
    },
    [settings, showToast, loggedIn]
  );

  const updateGameSettings = useCallback(
    async (gameSettings: SettingsData['gameSettings']): Promise<boolean> => {
      try {
        const updated = { ...settings, gameSettings };
        if (loggedIn) await getRepository(true).saveSettings(updated);
        else await saveSettingsData(updated);
        setSettings(updated);
        showToast('Game settings saved');
        return true;
      } catch {
        showToast('Unable to save game settings');
        return false;
      }
    },
    [settings, showToast, loggedIn]
  );

  return (
    <SettingsContext.Provider
      value={{
        settings,
        settingsModalOpen,
        activePanel,
        initialGroupsView,
        setInitialGroupsView,
        openSettingsModal,
        openSettingsToNewGroup,
        closeSettingsModal,
        setActivePanel,
        updateProfile,
        updateUsualSuspects,
        updateGameSettings,
        reload: loadAndSetSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
}
