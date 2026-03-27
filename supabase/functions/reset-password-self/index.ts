import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, securityAnswer, newPassword } = await req.json();

    if (!username || !securityAnswer || !newPassword || newPassword.length < 4) {
      return new Response(JSON.stringify({ error: "All fields required. Password must be at least 4 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const normalizedUsername = username.trim().toLowerCase();

    // Find the profile
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, security_question, security_answer")
      .eq("username", normalizedUsername)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Username not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.security_answer) {
      return new Response(JSON.stringify({ error: "No security question set for this account. Contact an admin." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compare answers (case-insensitive)
    if (profile.security_answer.toLowerCase().trim() !== securityAnswer.toLowerCase().trim()) {
      return new Response(JSON.stringify({ error: "Incorrect security answer." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reset the password
    const { error } = await adminClient.auth.admin.updateUserById(profile.user_id, { password: newPassword });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
