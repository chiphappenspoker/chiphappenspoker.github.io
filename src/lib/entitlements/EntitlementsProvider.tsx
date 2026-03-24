'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase, isSupabasePlaceholder } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { tierFromProfile } from './resolveTier';
import { featureFlagsForTier } from './featureFlags';
import type { EntitlementTier, FeatureFlags } from './types';
import { UpgradeModal } from '@/components/entitlements/UpgradeModal';

export interface NotificationPrefs {
  groupInvite: boolean;
  sessionSettled: boolean;
  settlementReminder: boolean;
}

const defaultNotificationPrefs: NotificationPrefs = {
  groupInvite: true,
  sessionSettled: true,
  settlementReminder: true,
};

function mergeNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== 'object') return { ...defaultNotificationPrefs };
  const o = raw as Record<string, unknown>;
  return {
    groupInvite: o.groupInvite !== false,
    sessionSettled: o.sessionSettled !== false,
    settlementReminder: o.settlementReminder !== false,
  };
}

interface EntitlementsContextValue {
  tier: EntitlementTier;
  flags: FeatureFlags;
  loading: boolean;
  proUnlockedAt: string | null;
  notificationPrefs: NotificationPrefs;
  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => Promise<void>;
  refresh: () => Promise<void>;
  upgradeModalOpen: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
}

const EntitlementsContext = createContext<EntitlementsContextValue | undefined>(undefined);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier] = useState<EntitlementTier>('free');
  const [loading, setLoading] = useState(true);
  const [proUnlockedAt, setProUnlockedAt] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>(defaultNotificationPrefs);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id || isSupabasePlaceholder) {
      setTier('free');
      setProUnlockedAt(null);
      setNotificationPrefsState(defaultNotificationPrefs);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('pro_unlocked_at, notification_prefs')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) {
      setTier('free');
      setProUnlockedAt(null);
      setNotificationPrefsState(defaultNotificationPrefs);
    } else {
      const unlocked = data.pro_unlocked_at as string | null;
      setProUnlockedAt(unlocked);
      setTier(tierFromProfile(unlocked));
      setNotificationPrefsState(mergeNotificationPrefs(data.notification_prefs));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setNotificationPrefs = useCallback(
    async (update: Partial<NotificationPrefs>) => {
      if (!user?.id || isSupabasePlaceholder) return;
      setNotificationPrefsState((prev) => {
        const next: NotificationPrefs = {
          groupInvite: update.groupInvite ?? prev.groupInvite,
          sessionSettled: update.sessionSettled ?? prev.sessionSettled,
          settlementReminder: update.settlementReminder ?? prev.settlementReminder,
        };
        void supabase
          .from('profiles')
          .update({
            notification_prefs: next,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
        return next;
      });
    },
    [user?.id]
  );

  const flags = useMemo(() => featureFlagsForTier(tier), [tier]);

  const value = useMemo(
    () => ({
      tier,
      flags,
      loading,
      proUnlockedAt,
      notificationPrefs,
      setNotificationPrefs,
      refresh,
      upgradeModalOpen,
      openUpgradeModal: () => setUpgradeModalOpen(true),
      closeUpgradeModal: () => setUpgradeModalOpen(false),
    }),
    [tier, flags, loading, proUnlockedAt, notificationPrefs, setNotificationPrefs, refresh, upgradeModalOpen]
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
      <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementsProvider');
  return ctx;
}
