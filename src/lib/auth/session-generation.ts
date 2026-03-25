import { supabase, isSupabasePlaceholder } from '../supabase/client';

const STORAGE_PREFIX = 'chiphappens:sessionGen:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getStoredSessionGeneration(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function setStoredSessionGeneration(userId: string, generation: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), String(generation));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredSessionGeneration(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Called only on SIGNED_IN (new login / OAuth). Increments server generation and stores locally.
 */
export async function bumpSessionGenerationAndStore(userId: string): Promise<void> {
  if (isSupabasePlaceholder || typeof window === 'undefined') return;
  const { data, error } = await supabase.rpc('bump_session_generation');
  if (error) {
    console.warn('[ChipHappens] bump_session_generation failed', error.message);
    return;
  }
  const gen = typeof data === 'number' ? data : Number(data);
  if (Number.isFinite(gen)) setStoredSessionGeneration(userId, gen);
}

/**
 * Compare DB generation to locally stored value. If mismatch, sign out (another device signed in).
 * If nothing stored yet, adopt current DB value (this device / first load after upgrade).
 */
export async function validateSessionGeneration(userId: string): Promise<'ok' | 'kicked' | 'skipped'> {
  if (isSupabasePlaceholder || typeof window === 'undefined') return 'skipped';

  const { data, error } = await supabase
    .from('profiles')
    .select('session_generation')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[ChipHappens] validateSessionGeneration', error.message);
    return 'skipped';
  }

  const dbGen = Number((data as { session_generation?: number } | null)?.session_generation ?? 0);
  const storedRaw = getStoredSessionGeneration(userId);

  if (storedRaw === null) {
    setStoredSessionGeneration(userId, dbGen);
    return 'ok';
  }

  const stored = Number(storedRaw);
  if (!Number.isFinite(stored) || stored !== dbGen) {
    clearStoredSessionGeneration(userId);
    await supabase.auth.signOut();
    return 'kicked';
  }

  return 'ok';
}
