import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { backend } = await import("@/test/mocks/backend");
  return { supabase: backend.client };
});

import { backend } from "@/test/mocks/backend";
import {
  fetchAdminUsers,
  getCurrentSession,
  loginSession,
  logoutSession,
  registerAccount,
  updateAdminUserStatus,
} from "@/lib/authApi";

const ADMIN_ID = "admin-uuid";
const USER_ID = "user-uuid";

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    user_id: USER_ID,
    full_name: "Jane Doe",
    username: "jane",
    department: "Planning",
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Queue what getCurrentSession() needs: a profile row plus role rows. */
function queueSession(role: "admin" | "user", over: Record<string, unknown> = {}) {
  const userId = role === "admin" ? ADMIN_ID : USER_ID;
  backend.signedInAs(userId);
  backend.queue("profiles", { data: profileRow({ user_id: userId, ...over }) });
  backend.queue("user_roles", { data: role === "admin" ? [{ role: "admin" }] : [{ role: "user" }] });
}

beforeEach(() => {
  backend.reset();
});

describe("loginSession", () => {
  it("signs in with the derived login email and returns the resolved role", async () => {
    backend.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    } as never);
    backend.queue("profiles", { data: { full_name: "Jane Doe", username: "jane", status: "approved" } });
    backend.queue("user_roles", { data: [{ role: "admin" }] });

    const result = await loginSession("  JANE  ", "secret123");

    expect(backend.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "jane@prsunitplatform.local",
      password: "secret123",
    });
    expect(result).toEqual({ username: "jane", full_name: "Jane Doe", role: "admin" });
    expect(backend.auth.signOut).not.toHaveBeenCalled();
  });

  it("resolves a plain user when no admin role row exists", async () => {
    backend.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    } as never);
    backend.queue("profiles", { data: { full_name: "Jane Doe", username: "jane", status: "approved" } });
    backend.queue("user_roles", { data: [{ role: "user" }] });

    await expect(loginSession("jane", "secret123")).resolves.toMatchObject({ role: "user" });
  });

  it("throws a single generic message on wrong credentials (no enumeration)", async () => {
    backend.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    } as never);

    await expect(loginSession("jane", "nope")).rejects.toThrow("Invalid username or password.");
  });

  it("uses the same generic message when the auth user has no profile row", async () => {
    backend.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    } as never);
    backend.queue("profiles", { data: null });

    await expect(loginSession("jane", "secret123")).rejects.toThrow("Invalid username or password.");
    expect(backend.auth.signOut).toHaveBeenCalled();
  });

  it.each([
    ["pending", "Account is pending admin approval."],
    ["declined", "Account has been declined by admin."],
    ["locked", "Account is locked by admin."],
  ])("rejects a %s account and destroys the session", async (status, message) => {
    backend.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    } as never);
    backend.queue("profiles", { data: { full_name: "Jane", username: "jane", status } });

    await expect(loginSession("jane", "secret123")).rejects.toThrow(message);
    expect(backend.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("logoutSession", () => {
  it("signs the user out", async () => {
    await logoutSession();
    expect(backend.auth.signOut).toHaveBeenCalled();
  });
});

describe("getCurrentSession", () => {
  it("returns null when signed out and never queries profiles", async () => {
    backend.signedOut();
    await expect(getCurrentSession()).resolves.toBeNull();
    expect(backend.for("profiles")).toHaveLength(0);
  });

  it("hydrates the profile and role for the signed-in user", async () => {
    queueSession("admin");
    const session = await getCurrentSession();
    expect(session).toMatchObject({ id: ADMIN_ID, role: "admin", status: "approved" });
    expect(backend.for("profiles")[0].called("eq", "user_id", ADMIN_ID)).toBe(true);
  });
});

describe("registerAccount", () => {
  const base = {
    fullName: "Jane Doe",
    username: "jane",
    email: "jane@example.com",
    department: "Planning",
    password: "secret123",
    securityQuestion: "First pet?",
    securityAnswer: "rex",
  };

  it("rejects passwords shorter than 8 characters before any network call", async () => {
    await expect(registerAccount({ ...base, password: "short" })).rejects.toThrow(
      "Password must be at least 8 characters.",
    );
    expect(backend.auth.signUp).not.toHaveBeenCalled();
  });

  it.each(["Dr. Yusuf", "ab", "has space", "bad$chars", "a".repeat(33)])(
    "rejects the invalid username %j",
    async (username) => {
      await expect(registerAccount({ ...base, username })).rejects.toThrow(/Username/);
      expect(backend.auth.signUp).not.toHaveBeenCalled();
    },
  );

  it("rejects a duplicate username", async () => {
    backend.queue("profiles", { data: { id: "existing" } });
    await expect(registerAccount(base)).rejects.toThrow("Username already exists.");
    expect(backend.auth.signUp).not.toHaveBeenCalled();
  });

  it("normalises the username, stores the security answer server-side and signs out", async () => {
    backend.queue("profiles", { data: null });
    backend.auth.signUp.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null } as never);

    const message = await registerAccount({ ...base, username: "  JaNe  " });

    expect(backend.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jane@prsunitplatform.local", password: "secret123" }),
    );
    // The answer is never written from the client — it goes through the edge function.
    expect(backend.functions.invoke).toHaveBeenCalledWith("set-security-answer", {
      body: { userId: USER_ID, securityQuestion: "First pet?", securityAnswer: "rex" },
    });
    expect(backend.for("profile_recovery")).toHaveLength(0);
    // New accounts must not stay signed in: they await admin approval.
    expect(backend.auth.signOut).toHaveBeenCalled();
    expect(message).toMatch(/awaiting admin approval/i);
  });

  it("surfaces a signup error from the backend", async () => {
    backend.queue("profiles", { data: null });
    backend.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    } as never);
    await expect(registerAccount(base)).rejects.toThrow("User already registered");
  });
});

describe("admin account actions", () => {
  it.each(["approved", "declined", "locked"] as const)("writes status %s for an admin", async (status) => {
    queueSession("admin");
    backend.queue("profiles", { data: profileRow({ status }) });
    backend.queue("user_roles", { data: [{ role: "user" }] });

    const updated = await updateAdminUserStatus(USER_ID, status);

    const updateQuery = backend.for("profiles")[1];
    expect(updateQuery.argsFor("update")).toEqual([{ status }]);
    expect(updateQuery.called("eq", "user_id", USER_ID)).toBe(true);
    expect(updated.status).toBe(status);
  });

  it("unlocks by writing approved", async () => {
    queueSession("admin");
    backend.queue("profiles", { data: profileRow({ status: "approved" }) });
    backend.queue("user_roles", { data: [{ role: "user" }] });

    await updateAdminUserStatus(USER_ID, "approved");
    expect(backend.for("profiles")[1].argsFor("update")).toEqual([{ status: "approved" }]);
  });

  it.each(["approved", "declined", "locked"] as const)(
    "blocks a non-admin from setting status %s",
    async (status) => {
      queueSession("user");
      await expect(updateAdminUserStatus(USER_ID, status)).rejects.toThrow("Admin access required.");
      // Only the session lookup ran — no write was attempted.
      expect(backend.for("profiles").some((q) => q.called("update"))).toBe(false);
    },
  );

  it("blocks a signed-out caller from changing status", async () => {
    backend.signedOut();
    await expect(updateAdminUserStatus(USER_ID, "approved")).rejects.toThrow("Admin access required.");
    expect(backend.for("profiles")).toHaveLength(0);
  });

  it("prevents an admin from declining or locking their own account", async () => {
    queueSession("admin");
    await expect(updateAdminUserStatus(ADMIN_ID, "locked")).rejects.toThrow(
      "Admin account cannot be declined or locked.",
    );

    backend.reset();
    queueSession("admin");
    await expect(updateAdminUserStatus(ADMIN_ID, "declined")).rejects.toThrow(
      "Admin account cannot be declined or locked.",
    );
  });

  it("lists users with resolved roles for an admin", async () => {
    queueSession("admin");
    backend.queue("profiles", {
      data: [profileRow(), profileRow({ user_id: ADMIN_ID, username: "boss" })],
    });
    backend.queue("user_roles", { data: [{ user_id: ADMIN_ID, role: "admin" }] });

    const users = await fetchAdminUsers();

    expect(users.map((u) => u.role)).toEqual(["user", "admin"]);
    expect(users[1].email).toBe("boss@prsunitplatform.local");
  });

  it("blocks a non-admin from listing users", async () => {
    queueSession("user");
    await expect(fetchAdminUsers()).rejects.toThrow("Admin access required.");
    expect(backend.for("profiles")).toHaveLength(1); // session lookup only
  });
});
