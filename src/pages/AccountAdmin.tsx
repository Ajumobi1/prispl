import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AccountStatus,
  AccountUser,
  fetchAdminUsers,
  getCurrentSession,
  logoutSession,
  updateAdminUserStatus,
} from "@/lib/authApi";

const orderedStatus: AccountStatus[] = ["pending", "approved", "locked", "declined"];

export default function AccountAdminPage() {
  const navigate = useNavigate();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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

  const signOut = async () => {
    await logoutSession();
    navigate("/login");
  };

  if (!sessionChecked && isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading account administration...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Account Administration</h1>
            <p className="text-sm text-muted-foreground">Approve, decline, lock, and unlock user access securely.</p>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/task-tracker">Task Tracker</Link></Button>
            <Button variant="outline" size="sm" onClick={signOut}>Logout</Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading ? (
          <p className="text-center text-muted-foreground">Loading users...</p>
        ) : (
          grouped.map((entry) => (
            <Card key={entry.status}>
              <CardHeader>
                <CardTitle className="capitalize">{entry.status} ({entry.users.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {entry.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users in this state.</p>
                ) : (
                  <Table>
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
                            <div className="flex gap-1">
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
    </div>
  );
}
