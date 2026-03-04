import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../supabase/client';
import { startSyncEngine, stopSyncEngine } from '../sync/sync-engine';
import { migrateLocalToCloud, needsMigration } from './migrate-local-to-cloud';

async function ensureProfile(userId: string, metadata: { full_name?: string; name?: string; email?: string }): Promise<void> {
  const displayName = metadata?.full_name ?? metadata?.name ?? (metadata?.email ? metadata.email.split('@')[0] : '') ?? '';
  await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: displayName,
      revtag: '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
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

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? '' });
        ensureProfile(session.user.id, session.user.user_metadata ?? {}).catch(() => {});
        startSyncEngine();
      } else {
        setUser(null);
        stopSyncEngine();
      }
      setLoading(false);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser({ id: data.user.id, email: data.user.email ?? '' });
        ensureProfile(data.user.id, data.user.user_metadata ?? {}).catch(() => {});
        startSyncEngine();
      }
      setLoading(false);
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

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? { error: error.message } : {};
  };
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    return error ? { error: error.message } : {};
  };
  const signOut = async () => {
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
