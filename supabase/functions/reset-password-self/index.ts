import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { hashAnswer, verifyAnswer, isLegacyHash } from "../_shared/passwordHash.ts";
import { rateLimit, clientKey, identifierKey, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GENERIC_INVALID = JSON.stringify({
  error: "Username or security answer is incorrect.",
});

const MIN_PASSWORD = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, securityAnswer, newPassword } = await req.json();

    if (!username || !securityAnswer || !newPassword) {
      return new Response(JSON.stringify({ error: `All fields required. Password must be at least ${MIN_PASSWORD} characters.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD) {
      return new Response(JSON.stringify({ error: `Password must be at least ${MIN_PASSWORD} characters.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUsername = String(username).trim().toLowerCase();

    // IP + targeted username: stops IP rotation from dodging the limit.
    const rlIp = await rateLimit({
      key: clientKey(req, "reset-password-self", normalizedUsername),
      limit: 5,
      windowMs: 60_000,
    });
    if (!rlIp.ok) return rateLimitResponse(rlIp, corsHeaders);

    // Username alone: stops a botnet brute-forcing one account from many IPs.
    const rlAccount = await rateLimit({
      key: identifierKey("reset-password-self:account", normalizedUsername),
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!rlAccount.ok) return rateLimitResponse(rlAccount, corsHeaders);


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const normalizedUsername = username.trim().toLowerCase();

    const { data: profile } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (!profile) {
      return new Response(GENERIC_INVALID, {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recovery } = await adminClient
      .from("profile_recovery")
      .select("security_answer")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    // Generic response for both "no such user" and "no question set"
    if (!recovery || !recovery.security_answer) {
      return new Response(GENERIC_INVALID, {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await verifyAnswer(securityAnswer, recovery.security_answer);
    if (!ok) {
      return new Response(GENERIC_INVALID, {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await adminClient.auth.admin.updateUserById(profile.user_id, { password: newPassword });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hash-upgrade: if the stored answer used the legacy fast SHA-256 hash,
    // re-hash with the modern KDF now that we know the plaintext is correct.
    if (isLegacyHash(recovery.security_answer)) {
      try {
        const upgraded = await hashAnswer(securityAnswer);
        await adminClient
          .from("profile_recovery")
          .update({ security_answer: upgraded })
          .eq("user_id", profile.user_id);
      } catch (_e) {
        // Non-fatal; reset already succeeded.
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
