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
  openSettingsFileForImport,
  saveSettingsDataAs,
} from '@/lib/storage/settings-store';
import { useToast } from './useToast';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getRepository } from '@/lib/data/sync-repository';

type SettingsPanel = 'hub' | 'profile' | 'groups' | 'gameDefaults' | null;

interface SettingsContextValue {
  settings: SettingsData;
  settingsModalOpen: boolean;
  activePanel: SettingsPanel;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  setActivePanel: (panel: SettingsPanel) => void;
  updateProfile: (profile: SettingsData['profile']) => Promise<boolean>;
  updateUsualSuspects: (suspects: UsualSuspect[]) => Promise<boolean>;
  updateGameSettings: (gs: SettingsData['gameSettings']) => Promise<boolean>;
  importSettings: () => Promise<boolean>;
  exportSettings: () => Promise<boolean>;
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
    setSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalOpen(false);
    setActivePanel(null);
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

  const importSettingsFn = useCallback(async (): Promise<boolean> => {
    try {
      const raw = await openSettingsFileForImport();
      if (!raw) return false;
      const normalized = normalizeSettingsData(raw, EMPTY_SUSPECTS);
      if (loggedIn) await getRepository(true).saveSettings(normalized);
      await saveSettingsData(normalized);
      setSettings(normalized);
      showToast('Settings imported');
      return true;
    } catch {
      showToast('Unable to import settings');
      return false;
    }
  }, [showToast, loggedIn]);

  const exportSettingsFn = useCallback(async (): Promise<boolean> => {
    try {
      await saveSettingsDataAs(settings);
      showToast('Settings exported');
      return true;
    } catch {
      showToast('Unable to export settings');
      return false;
    }
  }, [settings, showToast]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        settingsModalOpen,
        activePanel,
        openSettingsModal,
        closeSettingsModal,
        setActivePanel,
        updateProfile,
        updateUsualSuspects,
        updateGameSettings,
        importSettings: importSettingsFn,
        exportSettings: exportSettingsFn,
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
