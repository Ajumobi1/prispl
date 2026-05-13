import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hashAnswer } from "../_shared/passwordHash.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller's JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const { userId, securityQuestion, securityAnswer } = await req.json();

    if (
      typeof userId !== "string" || !userId ||
      typeof securityQuestion !== "string" || !securityQuestion.trim() ||
      typeof securityAnswer !== "string" || !securityAnswer.trim()
    ) {
      return new Response(JSON.stringify({ error: "Missing fields." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The caller must be setting their OWN security answer.
    if (userId !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Only allow setting if it has not been set yet (registration-only path)
    const { data: profile, error: readError } = await admin
      .from("profiles")
      .select("user_id, security_answer")
      .eq("user_id", userId)
      .maybeSingle();

    if (readError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.security_answer && profile.security_answer.length > 0) {
      return new Response(JSON.stringify({ error: "Security answer already set." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hashed = await hashAnswer(securityAnswer);

    const { error: updateError } = await admin
      .from("profiles")
      .update({ security_question: securityQuestion, security_answer: hashed })
      .eq("user_id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
