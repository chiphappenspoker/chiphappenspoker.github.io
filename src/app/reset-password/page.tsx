'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { BASE_PATH } from '@/lib/constants';
import { useAuth } from '@/lib/auth/AuthProvider';

function recoveryTokensPresent(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const fromHash = new URLSearchParams(hash).get('type');
  if (fromHash === 'recovery') return true;
  return new URLSearchParams(window.location.search).get('type') === 'recovery';
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState(recoveryTokensPresent());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const homeHref = BASE_PATH === '' ? '/' : `${BASE_PATH}/`;

  useEffect(() => {
    if (recoveryTokensPresent()) setAllowed(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setAllowed(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      const { error: updErr } = await supabase.auth.updateUser({ password });
      setSubmitting(false);
      if (updErr) {
        setError(updErr.message);
        return;
      }
      router.replace(homeHref);
    },
    [password, confirm, router, homeHref]
  );

  if (authLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{
          background: 'radial-gradient(1200px 700px at 80% -10%, #15151a 0%, var(--color-bg) 60%)',
          color: 'var(--color-text)',
        }}
      >
        <p className="muted-text">Loading…</p>
      </div>
    );
  }

  if (!allowed || !user) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{
          background: 'radial-gradient(1200px 700px at 80% -10%, #15151a 0%, var(--color-bg) 60%)',
          color: 'var(--color-text)',
        }}
      >
        <div className="card max-w-md w-full p-8">
          <h1 className="text-xl font-semibold mb-3" style={{ color: 'var(--color-accent)' }}>
            Reset link invalid or expired
          </h1>
          <p className="muted-text max-w-sm mx-auto mb-6">
            Request a new reset email from the sign-in screen, or open the latest link from your inbox.
          </p>
          <Link href={homeHref} className="ch-btn inline-block text-center no-underline">
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{
        background: 'radial-gradient(1200px 700px at 80% -10%, #15151a 0%, var(--color-bg) 60%)',
        color: 'var(--color-text)',
      }}
    >
      <div className="card max-w-md w-full p-8">
        <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-accent)' }}>
          Choose a new password
        </h1>
        <p className="muted-text text-sm mb-6 max-w-sm mx-auto">
          Signed in as <span className="text-[var(--color-text)]">{user.email}</span>. Enter your new password below.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-2 text-left">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="ch-input"
            name="password"
            id="reset-password-new"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="ch-input"
            name="confirm"
            id="reset-password-confirm"
          />
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <button type="submit" className="ch-btn mt-1" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
        <Link href={homeHref} className="ch-link text-xs mt-4 inline-block">
          Cancel and return to app
        </Link>
      </div>
    </div>
  );
}
