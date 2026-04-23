import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-seed-secret",
};

// SECURITY: This endpoint is gated by the SEED_ADMIN_SECRET env var.
// Without the secret, anyone could provision an admin account.
// The seed only succeeds when (a) no admin exists yet, AND (b) the caller
// presents the shared secret in the `x-seed-secret` header.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get("SEED_ADMIN_SECRET");
    if (!expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Seeding is disabled (no secret configured)." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providedSecret = req.headers.get("x-seed-secret");
    if (providedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Forbidden." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: { username?: string; password?: string; fullName?: string } = {};
    try {
      body = await req.json();
    } catch {
      // optional body
    }
    const username = (body.username || "admin").trim().toLowerCase();
    const password = body.password?.trim();
    const fullName = body.fullName?.trim() || "System Admin";

    if (!password || password.length < 12) {
      return new Response(
        JSON.stringify({ error: "Password is required and must be at least 12 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: existingAdmin } = await supabase
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (existingAdmin && existingAdmin.length > 0) {
      return new Response(
        JSON.stringify({ message: "Admin already exists." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: `${username}@prsunitplatform.local`,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          username,
          department: "Administration",
        },
      });

    if (authError) throw authError;
    const userId = authData.user.id;

    await supabase.from("profiles").update({ status: "approved" }).eq("user_id", userId);
    await supabase.from("user_roles").upsert({ user_id: userId, role: "admin" });

    return new Response(
      JSON.stringify({ message: "Admin user created successfully.", userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
