import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase, isSupabasePlaceholder } from '../supabase/client';
import { BASE_PATH } from '../constants';
import { startSyncEngine, stopSyncEngine } from '../sync/sync-engine';
import { migrateLocalToCloud, needsMigration } from './migrate-local-to-cloud';
import {
  bumpSessionGenerationAndStore,
  clearStoredSessionGeneration,
  validateSessionGeneration,
} from './session-generation';

/** Full URL where users land after clicking "Activate account" in the confirmation email (must match Supabase Redirect URLs allow list). */
function getEmailRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const base = origin.endsWith('/') ? `${origin.slice(0, -1)}${BASE_PATH}` : `${origin}${BASE_PATH}`;
  return `${base}/activate`;
}

async function ensureProfile(userId: string, metadata: { full_name?: string; name?: string; email?: string }): Promise<void> {
  // Only create a profile if one does not already exist to avoid overwriting
  // user-customized data (name, revtag, etc.) on every sign-in.
  const { data: existing, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (error || existing) return;

  const displayName = metadata?.full_name ?? metadata?.name ?? (metadata?.email ? metadata.email.split('@')[0] : '') ?? '';

  await supabase.from('profiles').insert({
    id: userId,
    display_name: displayName,
    revtag: '',
    updated_at: new Date().toISOString(),
  });
}

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSignedInUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      void (async () => {
        if (session?.user) {
          const u = { id: session.user.id, email: session.user.email ?? '' };
          setUser(u);
          lastSignedInUserIdRef.current = session.user.id;
          await ensureProfile(session.user.id, session.user.user_metadata ?? {});
          if (event === 'SIGNED_IN') {
            await bumpSessionGenerationAndStore(session.user.id);
          } else if (event === 'INITIAL_SESSION') {
            await validateSessionGeneration(session.user.id);
          }
          startSyncEngine();
        } else {
          const uid = lastSignedInUserIdRef.current;
          if (uid) clearStoredSessionGeneration(uid);
          lastSignedInUserIdRef.current = null;
          setUser(null);
          stopSyncEngine();
        }
        setLoading(false);
      })();
    });
    return () => {
      listener.subscription.unsubscribe();
      stopSyncEngine();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (needsMigration()) {
      migrateLocalToCloud(user.id).catch(() => {});
    }
  }, [user?.id]);

  /** Event-driven session generation check (no polling). */
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const run = () => {
      void validateSessionGeneration(uid);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);

  const wrapAuthError = (message: string): string => {
    if (isSupabasePlaceholder && (message === 'Failed to fetch' || message.includes('fetch')))
      return 'Sign-in is not configured for this deployment. The build must have NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set (e.g. GitHub Actions secrets).';
    return message;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: wrapAuthError(error.message) } : {};
  };
  const signUp = async (email: string, password: string) => {
    const redirectTo = getEmailRedirectUrl();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    return error ? { error: wrapAuthError(error.message) } : {};
  };
  const signInWithGoogle = async () => {
    const redirectTo = getEmailRedirectUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    return error ? { error: wrapAuthError(error.message) } : {};
  };
  const signOut = async () => {
    const uid = lastSignedInUserIdRef.current ?? user?.id;
    if (uid) clearStoredSessionGeneration(uid);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
