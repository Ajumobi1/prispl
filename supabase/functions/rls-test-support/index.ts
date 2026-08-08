import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-test-secret",
};

// SECURITY: Test-only provisioning endpoint for the RLS E2E suite.
// - Gated by RLS_TEST_SUPPORT_SECRET (x-test-secret header).
// - Hard-restricted to usernames prefixed "rls-test-": it can NEVER create,
//   modify, or delete a real account.
// - setup purges leftover rls-test-* accounts first (idempotent after a
//   crashed run); cleanup removes all test rows, storage objects, and users.

const PREFIX = "rls-test-";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const expected = Deno.env.get("RLS_TEST_SUPPORT_SECRET");
    if (!expected) {
      return json({ error: "Test support is disabled (no secret configured)." }, 403);
    }
    if (req.headers.get("x-test-secret") !== expected) {
      return json({ error: "Forbidden." }, 403);
    }

    let body: { action?: string } = {};
    try {
      body = await req.json();
    } catch {
      // optional body
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const listTestUsers = async (): Promise<{ id: string; email: string }[]> => {
      const out: { id: string; email: string }[] = [];
      let page = 1;
      for (;;) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const users = data?.users ?? [];
        for (const u of users) {
          if (u.email?.startsWith(PREFIX)) out.push({ id: u.id, email: u.email });
        }
        if (users.length < 200) break;
        page++;
      }
      return out;
    };

    const purge = async (): Promise<number> => {
      const users = await listTestUsers();
      const ids = users.map((u) => u.id);
      if (ids.length === 0) return 0;

      // Remove storage objects first, then metadata rows, then auth users
      // (deleting a user cascades profiles/user_roles/profile_recovery).
      const { data: vFiles } = await admin
        .from("vault_files")
        .select("file_path")
        .in("uploaded_by", ids);
      if (vFiles?.length) {
        await admin.storage.from("vault-files").remove(vFiles.map((f) => f.file_path));
      }
      const { data: tAtts } = await admin
        .from("task_attachments")
        .select("file_path")
        .in("uploaded_by", ids);
      if (tAtts?.length) {
        await admin.storage.from("task-attachments").remove(tAtts.map((a) => a.file_path));
      }

      await admin.from("vault_files").delete().in("uploaded_by", ids);
      await admin.from("vault_notes").delete().in("created_by", ids);
      await admin.from("vault_records").delete().in("created_by", ids);
      await admin.from("task_attachments").delete().in("uploaded_by", ids);
      await admin.from("tasks").delete().in("created_by", ids);
      await admin.from("client_errors").delete().in("user_id", ids);

      for (const u of users) {
        await admin.auth.admin.deleteUser(u.id);
      }
      return ids.length;
    };

    if (body.action === "cleanup") {
      const removed = await purge();
      const remaining = (await listTestUsers()).length;
      return json({ removed, remaining });
    }

    if (body.action === "setup") {
      await purge(); // clear any leftovers from a crashed prior run

      const mk = async (username: string, role: "user" | "admin", approve: boolean) => {
        if (!username.startsWith(PREFIX)) throw new Error("invalid test username");
        const password = `${crypto.randomUUID()}Aa1!`;
        const { data, error } = await admin.auth.admin.createUser({
          email: `${username}@prsunitplatform.local`,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: `RLS Test ${username}`,
            username,
            department: "Planning",
          },
        });
        if (error) throw error;
        const uid = data.user.id;
        if (approve) {
          await admin.from("profiles").update({ status: "approved" }).eq("user_id", uid);
        }
        if (role === "admin") {
          await admin.from("user_roles").insert({ user_id: uid, role: "admin" });
        }
        return { id: uid, username, password };
      };

      const a = await mk(`${PREFIX}a`, "user", true);
      const b = await mk(`${PREFIX}b`, "user", true);
      const adm = await mk(`${PREFIX}admin`, "admin", true);
      const pending = await mk(`${PREFIX}pending`, "user", false);

      return json({ a, b, admin: adm, pending });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
