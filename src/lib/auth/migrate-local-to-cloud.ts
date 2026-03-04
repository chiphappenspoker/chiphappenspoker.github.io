import { getLocalStorage } from '../storage/local-storage';
import { normalizeSettingsData } from '../storage/settings-store';
import { SETTINGS_STORAGE_KEY, MIGRATION_FLAG_KEY } from '../constants';
import { supabase } from '../supabase/client';
import type { SettingsData } from '../types';

const EMPTY_SUSPECTS: { name: string; revtag: string }[] = [];

/**
 * Migrates only profile/settings from local storage to cloud (e.g. after first sign-in).
 * Does NOT create game_sessions or game_players from payout/sidepot localStorage:
 * those keys hold the live form state, not "saved sessions". Sessions are created
 * only when the user clicks "Save session" in the Payout Calculator.
 */
export async function migrateLocalToCloud(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (getLocalStorage<string>(MIGRATION_FLAG_KEY) === 'true') return;

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
