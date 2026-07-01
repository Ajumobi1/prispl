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
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = caller.id;

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

    // Only allow setting if it has not been set yet (registration-only path).
    // Recovery data lives in a separate table with no client RLS access.
    const { data: recovery, error: readError } = await admin
      .from("profile_recovery")
      .select("user_id, security_answer")
      .eq("user_id", userId)
      .maybeSingle();

    if (readError) {
      return new Response(JSON.stringify({ error: "Profile not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recovery?.security_answer && recovery.security_answer.length > 0) {
      return new Response(JSON.stringify({ error: "Security answer already set." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hashed = await hashAnswer(securityAnswer);

    const { error: updateError } = await admin
      .from("profile_recovery")
      .upsert({ user_id: userId, security_question: securityQuestion, security_answer: hashed }, { onConflict: "user_id" });

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
