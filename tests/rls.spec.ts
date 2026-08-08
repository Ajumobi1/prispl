import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

// Database-level Row-Level-Security verification against the live dev backend.
//
// Uses four throwaway accounts provisioned by the secret-gated
// `rls-test-support` edge function (usernames hard-prefixed "rls-test-",
// all removed again after the run):
//   - rls-test-a / rls-test-b : approved regular users (each owns seed data)
//   - rls-test-admin          : approved admin
//   - rls-test-pending        : registered but never approved
//
// Asserts the INTENDED policy matrix, not UI filtering:
//   tasks/vault  -> read is shared across approved users (org design)
//   vault writes -> owner or admin only
//   task delete  -> denied for everyone (soft-delete only, owner/admin)
//   trash        -> trashed rows visible only to creator + admin (API level)
//   profiles     -> self read; username/department/status locked; others denied
//   user_roles   -> admin-only management
//
// Requires RLS_TEST_SUPPORT_SECRET in the environment (same value as the
// project secret). Run:
//   RLS_TEST_SUPPORT_SECRET=... bunx playwright test tests/rls.spec.ts

const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.RLS_TEST_SUPPORT_SECRET;

interface TestAccount {
  id: string;
  username: string;
  password: string;
}

async function support(action: "setup" | "cleanup") {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/rls-test-support`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      "x-test-secret": SECRET ?? "",
    },
    body: JSON.stringify({ action }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`rls-test-support ${action} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function expectBlocked(res: { data: unknown; error: unknown }, label: string) {
  const blocked =
    res.error != null ||
    res.data == null ||
    (Array.isArray(res.data) && res.data.length === 0);
  expect(blocked, `${label} should have been blocked but got ${JSON.stringify(res)}`).toBe(true);
}

test.describe.serial("database-level RLS enforcement", () => {
  test.setTimeout(240000);

  let accounts: { a: TestAccount; b: TestAccount; admin: TestAccount; pending: TestAccount };
  let a: SupabaseClient;
  let b: SupabaseClient;
  let adm: SupabaseClient;
  let pend: SupabaseClient;
  const seed: { taskId?: string; noteId?: string; recordId?: string; fileId?: string; filePath?: string } = {};

  test.beforeAll(async () => {
    if (!SECRET) throw new Error("RLS_TEST_SUPPORT_SECRET env var is required to run this suite");

    accounts = await support("setup");

    const signIn = async (acct: TestAccount) => {
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.auth.signInWithPassword({
        email: `${acct.username}@prsunitplatform.local`,
        password: acct.password,
      });
      if (error) throw new Error(`sign-in failed for ${acct.username}: ${error.message}`);
      return client;
    };
    [a, b, adm, pend] = await Promise.all([
      signIn(accounts.a),
      signIn(accounts.b),
      signIn(accounts.admin),
      signIn(accounts.pending),
    ]);

    // Seed data owned by user A.
    const { data: task, error: tErr } = await a
      .from("tasks")
      .insert({
        task_title: "RLS seed task",
        unit: "Planning",
        task_description: "seed",
        created_by: accounts.a.id,
      })
      .select()
      .single();
    if (tErr) throw new Error(`seed task failed: ${tErr.message}`);
    seed.taskId = task.id;

    const { data: note, error: nErr } = await a
      .from("vault_notes")
      .insert({ title: "A note", content: "owned by A", tags: [], created_by: accounts.a.id })
      .select()
      .single();
    if (nErr) throw new Error(`seed note failed: ${nErr.message}`);
    seed.noteId = note.id;

    const { data: rec, error: rErr } = await a
      .from("vault_records")
      .insert({ collection: "RLS", title: "A record", data: { k: "v" }, created_by: accounts.a.id })
      .select()
      .single();
    if (rErr) throw new Error(`seed record failed: ${rErr.message}`);
    seed.recordId = rec.id;

    const path = `${accounts.a.id}/rls/${Date.now()}-a-file.txt`;
    const { error: upErr } = await a.storage
      .from("vault-files")
      .upload(path, new Blob(["hello"], { type: "text/plain" }));
    if (upErr) throw new Error(`seed file upload failed: ${upErr.message}`);
    const { data: fileRow, error: fErr } = await a
      .from("vault_files")
      .insert({
        folder: "rls",
        file_name: "a-file.txt",
        file_path: path,
        content_type: "text/plain",
        file_size: 5,
        description: "",
        uploaded_by: accounts.a.id,
      })
      .select()
      .single();
    if (fErr) throw new Error(`seed file row failed: ${fErr.message}`);
    seed.fileId = fileRow.id;
    seed.filePath = path;
  });

  test.afterAll(async () => {
    try {
      const result = await support("cleanup");
      console.log(`rls-test-support cleanup: ${JSON.stringify(result)}`);
    } catch (e) {
      console.error("RLS TEST CLEANUP FAILED — run the cleanup action manually", e);
    }
  });

  // ---------- Cross-user isolation: vault notes ----------

  test("vault notes: approved user CAN read another user's note (org-shared design)", async () => {
    const { data, error } = await b.from("vault_notes").select("*").eq("id", seed.noteId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("vault notes: non-owner CANNOT update another user's note", async () => {
    const res = await b
      .from("vault_notes")
      .update({ title: "hijacked" })
      .eq("id", seed.noteId!)
      .select();
    expectBlocked(res, "update vault_notes");
  });

  test("vault notes: non-owner CANNOT delete another user's note", async () => {
    const res = await b.from("vault_notes").delete().eq("id", seed.noteId!).select();
    expectBlocked(res, "delete vault_notes");
  });

  // ---------- Cross-user isolation: vault records ----------

  test("vault records: approved user CAN read another user's record (org-shared design)", async () => {
    const { data, error } = await b.from("vault_records").select("*").eq("id", seed.recordId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("vault records: non-owner CANNOT update another user's record", async () => {
    const res = await b
      .from("vault_records")
      .update({ title: "hijacked" })
      .eq("id", seed.recordId!)
      .select();
    expectBlocked(res, "update vault_records");
  });

  test("vault records: non-owner CANNOT delete another user's record", async () => {
    const res = await b.from("vault_records").delete().eq("id", seed.recordId!).select();
    expectBlocked(res, "delete vault_records");
  });

  // ---------- Cross-user isolation: vault files + storage ----------

  test("vault files: approved user CAN read another user's file row (org-shared design)", async () => {
    const { data, error } = await b.from("vault_files").select("*").eq("id", seed.fileId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("vault files: non-owner CANNOT update another user's file row", async () => {
    const res = await b
      .from("vault_files")
      .update({ description: "hijacked" })
      .eq("id", seed.fileId!)
      .select();
    expectBlocked(res, "update vault_files");
  });

  test("vault files: non-owner CANNOT delete another user's file row", async () => {
    const res = await b.from("vault_files").delete().eq("id", seed.fileId!).select();
    expectBlocked(res, "delete vault_files");
  });

  test("vault storage: non-owner CANNOT remove another user's storage object", async () => {
    const { data, error } = await b.storage.from("vault-files").remove([seed.filePath!]);
    const blocked = error != null || !data || data.length === 0;
    expect(blocked, `storage remove should have been blocked: ${JSON.stringify({ data, error })}`).toBe(true);
    // Object must still exist for the owner.
    const { error: dlErr } = await a.storage.from("vault-files").download(seed.filePath!);
    expect(dlErr).toBeNull();
  });

  // ---------- Tasks: shared board, delete restrictions ----------

  test("tasks: approved user CAN read another user's task (org-shared board)", async () => {
    const { data, error } = await b.from("tasks").select("*").eq("id", seed.taskId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("tasks: approved user CAN update fields on another user's task (org-shared board)", async () => {
    const { data, error } = await b
      .from("tasks")
      .update({ status: "In Progress" })
      .eq("id", seed.taskId!)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("tasks: non-owner CANNOT soft-delete another user's task (DB trigger)", async () => {
    const { error } = await b
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: accounts.b.id })
      .eq("id", seed.taskId!);
    expect(error, "soft-delete by non-owner should raise the guard trigger").toBeTruthy();
    // Task must remain untrashed.
    const { data } = await a.from("tasks").select("deleted_at").eq("id", seed.taskId!).single();
    expect(data?.deleted_at).toBeNull();
  });

  test("tasks: hard delete is denied for regular users", async () => {
    const res = await b.from("tasks").delete().eq("id", seed.taskId!).select();
    expectBlocked(res, "hard delete tasks");
  });

  // ---------- Soft-delete boundary (the gap closed by this change) ----------

  test("trash: trashed task is invisible to other users, visible to creator and admin", async () => {
    // Owner soft-deletes own task (allowed by guard trigger).
    const { data: trashed, error: tErr } = await a
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: accounts.a.id })
      .eq("id", seed.taskId!)
      .select();
    expect(tErr).toBeNull();
    expect(trashed).toHaveLength(1);

    // Other approved user cannot see it at the API level.
    const { data: bView } = await b.from("tasks").select("id").eq("id", seed.taskId!);
    expect(bView, "trashed task leaked to non-owner via API").toHaveLength(0);

    // Creator still sees it (Trash view depends on this).
    const { data: aView } = await a.from("tasks").select("id").eq("id", seed.taskId!);
    expect(aView).toHaveLength(1);

    // Admin sees it too.
    const { data: admView } = await adm.from("tasks").select("id").eq("id", seed.taskId!);
    expect(admView).toHaveLength(1);

    // Owner restores it (creator allowed by guard trigger).
    const { error: rErr } = await a
      .from("tasks")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", seed.taskId!);
    expect(rErr).toBeNull();
    const { data: bViewAfter } = await b.from("tasks").select("id").eq("id", seed.taskId!);
    expect(bViewAfter).toHaveLength(1);
  });

  // ---------- Privilege escalation guards (regular user) ----------

  test("user_roles: regular user CANNOT grant themselves a role", async () => {
    const res = await b
      .from("user_roles")
      .insert({ user_id: accounts.b.id, role: "admin" })
      .select();
    expectBlocked(res, "insert user_roles");
  });

  test("user_roles: regular user CANNOT modify roles", async () => {
    const res = await b
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", accounts.b.id)
      .select();
    expectBlocked(res, "update user_roles");
  });

  test("user_roles: regular user CANNOT delete roles", async () => {
    const res = await b.from("user_roles").delete().eq("user_id", accounts.b.id).select();
    expectBlocked(res, "delete user_roles");
  });

  test("profiles: regular user CANNOT modify another user's profile", async () => {
    const res = await b
      .from("profiles")
      .update({ status: "locked" })
      .eq("user_id", accounts.a.id)
      .select();
    expectBlocked(res, "update another user's profile");
  });

  test("profiles: regular user CANNOT change their own status (approve/lock themselves)", async () => {
    const res = await b
      .from("profiles")
      .update({ status: "locked" })
      .eq("user_id", accounts.b.id)
      .select();
    expectBlocked(res, "self status change");
  });

  test("profiles: regular user CANNOT change their own username", async () => {
    const res = await b
      .from("profiles")
      .update({ username: "hijacked-name" })
      .eq("user_id", accounts.b.id)
      .select();
    expectBlocked(res, "self username change");
  });

  test("profiles: regular user CANNOT change their own department", async () => {
    const res = await b
      .from("profiles")
      .update({ department: "Administration" })
      .eq("user_id", accounts.b.id)
      .select();
    expectBlocked(res, "self department change");
  });

  test("profile_recovery: not readable by regular users or admins (service-role only)", async () => {
    const asUser = await b.from("profile_recovery" as never).select("*");
    expect(asUser.error, "profile_recovery readable by regular user").toBeTruthy();
    const asAdmin = await adm.from("profile_recovery" as never).select("*");
    expect(asAdmin.error, "profile_recovery readable by admin via API").toBeTruthy();
  });

  test("pending (unapproved) user cannot read tasks or vault data at all", async () => {
    const { data: tasks } = await pend.from("tasks").select("id");
    expect(tasks, "pending user could read tasks").toHaveLength(0);
    const { data: notes } = await pend.from("vault_notes").select("id");
    expect(notes, "pending user could read vault notes").toHaveLength(0);
    const { data: files } = await pend.from("vault_files").select("id");
    expect(files, "pending user could read vault files").toHaveLength(0);
  });

  // ---------- Admin scope: what admins CAN do, and what they still CANNOT ----------

  test("admin CAN read all profiles", async () => {
    const { data, error } = await adm.from("profiles").select("user_id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((p) => p.user_id);
    for (const acct of [accounts.a, accounts.b, accounts.admin, accounts.pending]) {
      expect(ids).toContain(acct.id);
    }
  });

  test("admin CAN approve/lock accounts (account status management)", async () => {
    const { data: locked, error: lErr } = await adm
      .from("profiles")
      .update({ status: "locked" })
      .eq("user_id", accounts.b.id)
      .select();
    expect(lErr).toBeNull();
    expect(locked).toHaveLength(1);

    const { data: restored, error: rErr } = await adm
      .from("profiles")
      .update({ status: "approved" })
      .eq("user_id", accounts.b.id)
      .select();
    expect(rErr).toBeNull();
    expect(restored).toHaveLength(1);
  });

  test("admin CAN view all role assignments", async () => {
    const { data, error } = await adm.from("user_roles").select("user_id, role");
    expect(error).toBeNull();
    expect((data ?? []).some((r) => r.user_id === accounts.admin.id && r.role === "admin")).toBe(true);
  });

  test("admin CAN soft-delete and restore another user's task", async () => {
    const { data: trashed, error: tErr } = await adm
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: accounts.admin.id })
      .eq("id", seed.taskId!)
      .select();
    expect(tErr).toBeNull();
    expect(trashed).toHaveLength(1);

    const { error: rErr } = await adm
      .from("tasks")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", seed.taskId!);
    expect(rErr).toBeNull();
  });

  test("admin CANNOT hard-delete tasks (delete denied for everyone)", async () => {
    const res = await adm.from("tasks").delete().eq("id", seed.taskId!).select();
    expectBlocked(res, "admin hard delete tasks");
  });

  // ---------- Cleanup verification ----------

  test("cleanup: all rls-test-* accounts and data are fully removed", async () => {
    const result = await support("cleanup");
    expect(result.remaining, `leftover test users: ${JSON.stringify(result)}`).toBe(0);

    // Credentials must no longer work.
    const stale = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await stale.auth.signInWithPassword({
      email: `${accounts.a.username}@prsunitplatform.local`,
      password: accounts.a.password,
    });
    expect(error, "test account A still able to sign in after cleanup").toBeTruthy();
  });
});
