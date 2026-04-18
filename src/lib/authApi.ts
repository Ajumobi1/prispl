import { supabase } from "@/integrations/supabase/client";

export type AccountRole = "user" | "admin";
export type AccountStatus = "pending" | "approved" | "declined" | "locked";

export interface SessionUser {
  id: string;
  full_name: string;
  username: string;
  email: string;
  department: string;
  role: AccountRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface AccountUser extends SessionUser {}

async function getProfileWithRole(userId: string, email: string): Promise<SessionUser | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const role: AccountRole = roleData?.some((r: any) => r.role === "admin") ? "admin" : "user";

  return {
    id: userId,
    full_name: profile.full_name,
    username: profile.username,
    email,
    department: profile.department,
    role,
    status: profile.status as AccountStatus,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

export async function loginSession(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();

  // Sign in first (no profile lookup needed before auth)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: `${normalizedUsername}@prsunitplatform.local`,
    password,
  });

  if (authError || !authData.user) {
    throw new Error("Invalid username or password.");
  }

  // Now that we're authenticated, check profile status
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, status")
    .eq("user_id", authData.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    throw new Error("Invalid username or password.");
  }

  if (profile.status !== "approved") {
    await supabase.auth.signOut();
    if (profile.status === "pending") throw new Error("Account is pending admin approval.");
    if (profile.status === "declined") throw new Error("Account has been declined by admin.");
    if (profile.status === "locked") throw new Error("Account is locked by admin.");
  }

  // Fetch role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);

  const role: AccountRole = roleData?.some((r: any) => r.role === "admin") ? "admin" : "user";

  return {
    username: profile.username,
    full_name: profile.full_name,
    role,
  };
}

export async function logoutSession(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentSession(): Promise<SessionUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  return getProfileWithRole(session.user.id, session.user.email ?? "");
}

export async function registerAccount(payload: {
  fullName: string;
  username: string;
  email: string;
  department: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
}): Promise<string> {
  const normalizedUsername = payload.username.trim().toLowerCase();
  if (!normalizedUsername || !payload.password.trim()) {
    throw new Error("Username and password are required.");
  }

  // Check if username already exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (existing) {
    throw new Error("Username already exists.");
  }

  // Sign up with Supabase auth using username@prsunitplatform.local as email
  const { data: signUpData, error } = await supabase.auth.signUp({
    email: `${normalizedUsername}@prsunitplatform.local`,
    password: payload.password,
    options: {
      data: {
        full_name: payload.fullName.trim(),
        username: normalizedUsername,
        department: payload.department.trim() || "Planning",
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  // Set security question/answer via edge function (uses service role to bypass
  // the column-level lockdown that hides security_answer from all clients).
  if (signUpData.user) {
    const { error: secError } = await supabase.functions.invoke("set-security-answer", {
      body: {
        userId: signUpData.user.id,
        securityQuestion: payload.securityQuestion,
        securityAnswer: payload.securityAnswer,
      },
    });
    if (secError) {
      console.error("Failed to set security answer:", secError);
    }
  }

  // Sign out immediately since the account needs admin approval
  await supabase.auth.signOut();

  return "Account submitted. Awaiting admin approval.";
}

export async function fetchAdminUsers(): Promise<AccountUser[]> {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") throw new Error("Admin access required.");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Get all roles
  const { data: allRoles } = await supabase
    .from("user_roles")
    .select("user_id, role");

  return (profiles ?? []).map((p: any) => {
    const roles = allRoles?.filter((r: any) => r.user_id === p.user_id) ?? [];
    const role: AccountRole = roles.some((r: any) => r.role === "admin") ? "admin" : "user";
    return {
      id: p.user_id,
      full_name: p.full_name,
      username: p.username,
      email: `${p.username}@prsunitplatform.local`,
      department: p.department,
      role,
      status: p.status as AccountStatus,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });
}

export async function updateAdminUserStatus(
  userId: string,
  status: AccountStatus
): Promise<AccountUser> {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") throw new Error("Admin access required.");

  if (userId === session.id && status !== "approved") {
    throw new Error("Admin account cannot be declined or locked.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const role: AccountRole = roleData?.some((r: any) => r.role === "admin") ? "admin" : "user";

  return {
    id: userId,
    full_name: data.full_name,
    username: data.username,
    email: `${data.username}@prsunitplatform.local`,
    department: data.department,
    role,
    status: data.status as AccountStatus,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
