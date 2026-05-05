import { BASE_PATH, getSiteOrigin } from '@/lib/constants';

/**
 * Public app root (no trailing slash). Uses NEXT_PUBLIC_SITE_URL when set (recommended for
 * production builds) so auth redirects match the live host; otherwise falls back to
 * window.location.origin in the browser.
 */
function appBaseUrl(): string {
  const origin = getSiteOrigin();
  if (!origin) return '';
  const root = `${origin}${BASE_PATH}`;
  return root.endsWith('/') ? root.slice(0, -1) : root;
}

/** Email signup confirmation link target (Supabase Redirect URLs allow list). */
export function getActivateRedirectUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/activate` : '';
}

/** OAuth (e.g. Google) callback redirect — main app root, not /activate. */
export function getOAuthRedirectUrl(): string {
  return appBaseUrl();
}

/** Password recovery email link target (Supabase Redirect URLs allow list). */
export function getPasswordResetRedirectUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/reset-password` : '';
}
