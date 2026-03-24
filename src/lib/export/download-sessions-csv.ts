import { supabase } from '@/lib/supabase/client';

function functionsBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.includes('placeholder')) return null;
  return `${url.replace(/\/$/, '')}/functions/v1`;
}

/**
 * Fetches CSV export for the signed-in user (PRO only). Edge Function returns 403 for FREE.
 */
export async function downloadSessionsCsv(): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = functionsBaseUrl();
  if (!base) {
    return { ok: false, message: 'Export is not configured (missing Supabase URL).' };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, message: 'Sign in to export.' };
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) {
    return { ok: false, message: 'Missing anon key.' };
  }

  const res = await fetch(`${base}/export-sessions-csv`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
    },
  });

  if (res.status === 403) {
    return { ok: false, message: 'Export is a Pro feature.' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, message: text || `Export failed (${res.status})` };
  }

  const blob = await res.blob();
  const dispo = res.headers.get('Content-Disposition');
  const match = dispo?.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? 'chiphappens-sessions.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
