import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';

function createSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    return createClient(PLACEHOLDER_URL, 'placeholder-anon-key');
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = createSupabaseClient();

/** True when build had no Supabase env (e.g. CI without secrets). Use to show a clear error instead of "Failed to fetch". */
export const isSupabasePlaceholder =
  !supabaseUrl || supabaseUrl === PLACEHOLDER_URL;