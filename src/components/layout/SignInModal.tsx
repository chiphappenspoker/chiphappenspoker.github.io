import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';


export function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn, signUp, signInWithGoogle, user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
    // Always show sign-in screen when modal is opened
    useEffect(() => {
      if (open) {
        setMode('signin');
        setInfo(null);
        setError(null);
      }
    }, [open]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;
  if (user) return null;


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    if (mode === 'reset') {
      // Password reset logic
      try {
        const { error } = await import('@/lib/supabase/client').then(({ supabase }) =>
          supabase.auth.resetPasswordForEmail(email)
        );
        if (error) setError(error.message);
        else setInfo('Password reset email sent. Check your inbox.');
      } catch (err: any) {
        setError('Failed to send reset email.');
      }
      setSubmitting(false);
      return;
    }
    const fn = mode === 'signin' ? signIn : signUp;
    const result = await fn(email, password);
    if (result.error) setError(result.error);
    setSubmitting(false);
    if (!result.error) onClose();
  };

  // Helper to clear info and error on navigation
  const handleNav = (newMode: typeof mode) => {
    setMode(newMode);
    setInfo(null);
    setError(null);
  };
  const handleClose = () => {
    setInfo(null);
    setError(null);
    onClose();
  };

  return (
    <div className="ch-modal-backdrop">
      <div className="ch-modal">
        <h2 className="text-lg font-bold mb-2">
          {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Reset Password'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="ch-input"
            autoFocus
            name="email"
            id="sign-in-email"
          />
          {mode !== 'reset' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="ch-input"
              name="password"
              id="sign-in-password"
            />
          )}
          {error && <div className="text-red-500 text-sm">{error}</div>}
          {info && <div className="text-green-600 text-sm">{info}</div>}
          <button type="submit" className="ch-btn" disabled={submitting || loading}>
            {submitting
              ? 'Please wait...'
              : mode === 'signin'
              ? 'Sign In'
              : mode === 'signup'
              ? 'Sign Up'
              : 'Send Reset Email'}
          </button>
          {(mode === 'signin' || mode === 'signup') && (
            <button
              type="button"
              className="ch-btn"
              disabled={submitting || loading}
              onClick={async () => {
                setSubmitting(true);
                setError(null);
                const result = await signInWithGoogle();
                if (result.error) setError(result.error);
                setSubmitting(false);
                if (!result.error) onClose();
              }}
            >
              Sign in with Google
            </button>
          )}
        </form>
        <div className="flex flex-col gap-1 mt-2 text-xs">
          <div className="flex justify-between">
            {(mode === 'signin' || mode === 'signup') && (
              <button
                onClick={() => handleNav(mode === 'signin' ? 'signup' : 'signin')}
                className="ch-link"
              >
                {mode === 'signin' ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
              </button>
            )}
            {mode === 'reset' && (
              <button
                onClick={() => handleNav('signin')}
                className="ch-link"
              >
                Back to Sign In
              </button>
            )}
            <button onClick={handleClose} className="ch-link">Close</button>
          </div>
          {mode !== 'reset' && (
            <button
              onClick={() => handleNav('reset')}
              className="ch-link text-left mt-1"
              style={{ alignSelf: 'flex-start' }}
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
      {/* Modal styles moved to global CSS */}
    </div>
  );
}
