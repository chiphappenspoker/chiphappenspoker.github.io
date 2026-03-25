import { getLocalStorage } from '../storage/local-storage';
import { normalizeSettingsData } from '../storage/settings-store';
import { SETTINGS_STORAGE_KEY, MIGRATION_FLAG_KEY } from '../constants';
import { supabase } from '../supabase/client';
import type { SettingsData } from '../types';

const EMPTY_SUSPECTS: { name: string; revtag: string }[] = [];

/**
 * Migrates only profile/settings from local storage to cloud (e.g. after first sign-in).
 * Only writes to cloud if no profile row exists yet (true first-time user). If a profile
 * already exists (e.g. updated on another device), we do NOT overwrite it so the user
 * sees their latest profile when opening the app on this device.
 * Does NOT create game_sessions or game_players from payout/sidepot localStorage.
 */
export async function migrateLocalToCloud(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (getLocalStorage<string>(MIGRATION_FLAG_KEY) === 'true') return;

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    }
    return;
  }

  const settingsRaw = getLocalStorage<Partial<SettingsData> | null>(SETTINGS_STORAGE_KEY);
  const settings = normalizeSettingsData(settingsRaw, EMPTY_SUSPECTS);

  await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: settings.profile.name || '',
      revtag: settings.profile.revtag || '',
      currency: settings.gameSettings.currency,
      default_buy_in: settings.gameSettings.defaultBuyIn,
      settlement_mode: settings.gameSettings.settlementMode,
      leaderboard_opt_out: settings.profile.leaderboardOptOut,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
  }
}

export function needsMigration(): boolean {
  if (typeof window === 'undefined') return false;
  if (getLocalStorage<string>(MIGRATION_FLAG_KEY) === 'true') return false;
  const hasSettings = !!getLocalStorage(SETTINGS_STORAGE_KEY);
  return hasSettings;
}
