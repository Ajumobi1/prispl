import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generic response: never reveal whether the username exists or whether
// it has a security question configured. Account-enumeration via this
// endpoint must be impossible.
const GENERIC_ERROR = JSON.stringify({
  error: "Unable to retrieve a security question for that account. Contact an admin if you cannot recover access.",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username } = await req.json();
    if (!username || typeof username !== "string") {
      return new Response(GENERIC_ERROR, {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("security_question")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (!profile || !profile.security_question) {
      return new Response(GENERIC_ERROR, {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ security_question: profile.security_question }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(GENERIC_ERROR, {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
