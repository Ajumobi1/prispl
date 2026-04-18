import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    const hashed = await sha256Hex(securityAnswer.toLowerCase().trim());

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
