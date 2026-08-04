import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { rateLimit, clientKey, identifierKey, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generic response: never reveal whether the username exists or whether
// it has a security question configured. Account-enumeration via this
// endpoint must be impossible — same status code, same shape, same timing.
const GENERIC_ERROR_MESSAGE =
  "Unable to retrieve a security question for that account. Contact an admin if you cannot recover access.";

// Always respond 200 so an attacker cannot distinguish existing vs missing
// accounts from the HTTP status. The client treats `error` in the body as
// the failure signal.
function respond(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Coarse IP-only guard before parsing.
  const rlIpOnly = await rateLimit({ key: clientKey(req, "get-security-question"), limit: 20, windowMs: 60_000 });
  if (!rlIpOnly.ok) return rateLimitResponse(rlIpOnly, corsHeaders);

  try {
    const { username } = await req.json();
    if (!username || typeof username !== "string") {
      return respond({ error: GENERIC_ERROR_MESSAGE });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const rlIp = await rateLimit({
      key: clientKey(req, "get-security-question", normalizedUsername),
      limit: 5,
      windowMs: 60_000,
    });
    if (!rlIp.ok) return rateLimitResponse(rlIp, corsHeaders);

    const rlAccount = await rateLimit({
      key: identifierKey("get-security-question:account", normalizedUsername),
      limit: 20,
      windowMs: 15 * 60_000,
    });
    if (!rlAccount.ok) return rateLimitResponse(rlAccount, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);


    const { data: profile } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (!profile) {
      return respond({ error: GENERIC_ERROR_MESSAGE });
    }

    const { data: recovery } = await adminClient
      .from("profile_recovery")
      .select("security_question")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    if (!recovery || !recovery.security_question) {
      return respond({ error: GENERIC_ERROR_MESSAGE });
    }

    return respond({ security_question: recovery.security_question });
  } catch (_err) {
    return respond({ error: GENERIC_ERROR_MESSAGE });
  }
});
