/**
 * Stub for FCM / native push. Implement with Firebase Admin + device tokens when ready.
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: 'Not implemented',
      hint: 'Add FCM credentials and invoke from DB triggers or app events.',
    }),
    { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
