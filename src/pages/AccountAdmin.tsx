import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AccountStatus,
  AccountUser,
  fetchAdminUsers,
  getCurrentSession,
  logoutSession,
  updateAdminUserStatus,
} from "@/lib/authApi";
import { supabase } from "@/integrations/supabase/client";

const orderedStatus: AccountStatus[] = ["pending", "approved", "locked", "declined"];

export default function AccountAdminPage() {
  const navigate = useNavigate();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Password reset dialog state
  const [resetUser, setResetUser] = useState<AccountUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const session = await getCurrentSession();
        if (!session) {
          navigate("/login?next=/account-admin", { replace: true });
          return;
        }
        if (session.role !== "admin") {
          navigate("/task-tracker", { replace: true });
          return;
        }
        setSessionChecked(true);
        const fetched = await fetchAdminUsers();
        setUsers(fetched);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load users.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [navigate]);

  const grouped = useMemo(() => {
    return orderedStatus.map((status) => ({
      status,
      users: users.filter((user) => user.status === status),
    }));
  }, [users]);

  const updateStatus = async (user: AccountUser, status: AccountStatus) => {
    try {
      setBusyUserId(user.id);
      setError(null);
      const updated = await updateAdminUserStatus(user.id, status);
      setUsers((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update account status.";
      setError(message);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetPassword = async () => {
    setResetError(null);
    if (resetPassword.length < 4) {
      setResetError("Password must be at least 4 characters.");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError("Passwords do not match.");
      return;
    }
    setIsResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnError } = await supabase.functions.invoke("admin-reset-password", {
        body: { userId: resetUser!.id, newPassword: resetPassword },
      });
      if (fnError) throw new Error("Failed to reset password.");
      if (data?.error) throw new Error(data.error);
      setResetSuccess(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setIsResetting(false);
    }
  };

  const openResetDialog = (user: AccountUser) => {
    setResetUser(user);
    setResetPassword("");
    setResetConfirm("");
    setResetError(null);
    setResetSuccess(false);
  };

  const signOut = async () => {
    await logoutSession();
    navigate("/login");
  };

  if (!sessionChecked && isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading account administration...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-3 py-3 sm:px-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Account Administration</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Approve, decline, lock, and unlock user access securely.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 overflow-x-auto -mx-1 px-1 sm:overflow-visible">
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/task-tracker">Task Tracker</Link></Button>
            <UserMenu />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-3 sm:p-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading ? (
          <p className="text-center text-muted-foreground">Loading users...</p>
        ) : (
          grouped.map((entry) => (
            <Card key={entry.status}>
              <CardHeader>
                <CardTitle className="capitalize">{entry.status} ({entry.users.length})</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {entry.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users in this state.</p>
                ) : (
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.full_name}</TableCell>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.department}</TableCell>
                          <TableCell>{user.role}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {entry.status !== "approved" && (
                                <Button size="sm" variant="default" onClick={() => updateStatus(user, "approved")} disabled={busyUserId === user.id}>
                                  Approve
                                </Button>
                              )}
                              {entry.status !== "declined" && (
                                <Button size="sm" variant="destructive" onClick={() => updateStatus(user, "declined")} disabled={busyUserId === user.id}>
                                  Decline
                                </Button>
                              )}
                              {entry.status !== "locked" ? (
                                <Button size="sm" variant="outline" onClick={() => updateStatus(user, "locked")} disabled={busyUserId === user.id}>
                                  Lock
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => updateStatus(user, "approved")} disabled={busyUserId === user.id}>
                                  Unlock
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" onClick={() => openResetDialog(user)} disabled={busyUserId === user.id}>
                                Reset Password
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>

      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resetUser?.full_name}</strong> ({resetUser?.username})
            </DialogDescription>
          </DialogHeader>
          {resetSuccess ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-600">Password has been reset successfully.</p>
              <Button className="w-full" onClick={() => setResetUser(null)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input type="password" placeholder="New Password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
              <Input type="password" placeholder="Confirm Password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} />
              {resetError && <p className="text-sm text-destructive">{resetError}</p>}
              <Button className="w-full" onClick={handleResetPassword} disabled={isResetting}>
                {isResetting ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
