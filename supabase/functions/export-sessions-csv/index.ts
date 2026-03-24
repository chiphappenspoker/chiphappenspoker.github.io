import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('pro_unlocked_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr || !profile?.pro_unlocked_at) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  const { data: owned } = await admin.from('game_sessions').select('*').eq('created_by', user.id);
  const { data: memberRows } = await admin.from('group_members').select('group_id').eq('user_id', user.id);
  const groupIds = (memberRows ?? []).map((r: { group_id: string }) => r.group_id).filter(Boolean);
  let groupSessions: Record<string, unknown>[] = [];
  if (groupIds.length > 0) {
    const { data: gs } = await admin.from('game_sessions').select('*').in('group_id', groupIds);
    groupSessions = gs ?? [];
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...(owned ?? []), ...groupSessions]) {
    const r = row as Record<string, unknown>;
    const id = r.id as string;
    if (id) byId.set(id, r);
  }
  const sessions = Array.from(byId.values()).sort((a, b) => {
    const ca = String(a.created_at ?? a.session_date ?? '');
    const cb = String(b.created_at ?? b.session_date ?? '');
    return ca < cb ? 1 : ca > cb ? -1 : 0;
  });

  const header = [
    'session_id',
    'session_date',
    'currency',
    'status',
    'player_name',
    'buy_in',
    'cash_out',
    'net_result',
    'settled',
  ];
  const lines = [header.join(',')];

  for (const s of sessions) {
    const sid = s.id as string;
    const { data: players } = await admin.from('game_players').select('*').eq('session_id', sid);
    for (const p of players ?? []) {
      const pl = p as Record<string, unknown>;
      const row = [
        sid,
        String(s.session_date ?? ''),
        String(s.currency ?? ''),
        String(s.status ?? ''),
        String(pl.player_name ?? ''),
        String(pl.buy_in ?? ''),
        String(pl.cash_out ?? ''),
        String(pl.net_result ?? ''),
        String(pl.settled ?? ''),
      ].map((c) => escapeCsvCell(c));
      lines.push(row.join(','));
    }
  }

  const csv = lines.join('\n');
  const filename = `chiphappens-sessions-${user.id.slice(0, 8)}.csv`;
  return new Response(csv, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
