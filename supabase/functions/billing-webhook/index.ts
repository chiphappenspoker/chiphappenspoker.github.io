/**
 * Stub for future RevenueCat / Stripe webhooks.
 * Configure `verify_jwt = false` and protect with a shared secret header in production.
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
      hint: 'Wire RevenueCat or Stripe here; set profiles.pro_unlocked_at via service role.',
    }),
    { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
