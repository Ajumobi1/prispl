import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if admin already exists
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

    // Create admin user via auth
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: "admin@prsunitplatform.local",
        password: "admin",
        email_confirm: true,
        user_metadata: {
          full_name: "System Admin",
          username: "admin",
          department: "Administration",
        },
      });

    if (authError) throw authError;

    const userId = authData.user.id;

    // Update profile to approved status
    await supabase
      .from("profiles")
      .update({ status: "approved" })
      .eq("user_id", userId);

    // Add admin role
    await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" });

    return new Response(
      JSON.stringify({ message: "Admin user created successfully.", userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
