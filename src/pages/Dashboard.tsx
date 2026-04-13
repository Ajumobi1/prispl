import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentSession, logoutSession } from "@/lib/authApi";
import { fetchTasks } from "@/lib/api";
import { PRSTask, TaskStatus, UnitName } from "@/lib/task-types";

const statusVariant: Record<TaskStatus, "secondary" | "default" | "destructive" | "outline"> = {
  "Not Started": "secondary",
  "In Progress": "default",
  "Awaiting Review": "outline",
  Completed: "secondary",
  Delayed: "destructive",
};

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const monthIndex = Number(monthPart) - 1;
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex] ?? monthPart;
  return `${monthName} ${year}`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [tasks, setTasks] = useState<PRSTask[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const session = await getCurrentSession();
        if (!session) {
          navigate("/login?next=/dashboard", { replace: true });
          return;
        }
        setError(null);
        const data = await fetchTasks();
        setTasks(data);
        if (data.length > 0) {
          const months = Array.from(new Set(data.map((t) => t.dateAssigned.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
          setSelectedMonth((prev) => prev || months[0] || new Date().toISOString().slice(0, 7));
        } else {
          setSelectedMonth((prev) => prev || new Date().toISOString().slice(0, 7));
        }
        setIsAdmin(session?.role === "admin");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load dashboard data.";
        setError(message);
      } finally {
        setSessionChecked(true);
      }
    };
    load();
  }, [navigate]);

  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(tasks.map((t) => t.dateAssigned.slice(0, 7)).filter(Boolean)));
    if (!months.includes(selectedMonth)) months.push(selectedMonth);
    return months.sort((a, b) => b.localeCompare(a));
  }, [tasks, selectedMonth]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.dateAssigned.startsWith(selectedMonth)),
    [tasks, selectedMonth]
  );

  const byStatus = useMemo(() => ({
    total: visibleTasks.length,
    inProgress: visibleTasks.filter((t) => t.status === "In Progress").length,
    awaitingReview: visibleTasks.filter((t) => t.status === "Awaiting Review").length,
    completed: visibleTasks.filter((t) => t.status === "Completed").length,
    delayed: visibleTasks.filter((t) => t.status === "Delayed").length,
  }), [visibleTasks]);

  const byUnit = useMemo(() => {
    const units: UnitName[] = ["Planning", "Research", "Statistics", "M&E"];
    return units.map((unit) => ({
      unit,
      count: visibleTasks.filter((t) => t.unit === unit).length,
    }));
  }, [visibleTasks]);

  const logout = async () => {
    await logoutSession();
    navigate("/login");
  };

  if (!sessionChecked) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">DG / HOD Dashboard</h1>
            <p className="text-sm text-muted-foreground">Leadership summary view for Director General and Heads of Department.</p>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/task-tracker">Unit Tracker</Link></Button>
            {isAdmin && <Button variant="ghost" size="sm" asChild><Link to="/account-admin">Manage Accounts</Link></Button>}
            <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Month</span>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Total", value: byStatus.total },
            { label: "In Progress", value: byStatus.inProgress },
            { label: "Awaiting Review", value: byStatus.awaitingReview },
            { label: "Completed", value: byStatus.completed },
            { label: "Delayed", value: byStatus.delayed },
          ].map((item) => (
            <Card key={item.label}>
              <CardHeader className="pb-2"><CardDescription>{item.label}</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold text-foreground">{item.value}</p></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Department Snapshot</CardTitle>
            <CardDescription>Task volume by unit for {formatMonthLabel(selectedMonth)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Tasks</TableHead></TableRow></TableHeader>
              <TableBody>
                {byUnit.map((entry) => (
                  <TableRow key={entry.unit}><TableCell>{entry.unit}</TableCell><TableCell>{entry.count}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Overview</CardTitle>
            <CardDescription>Read-only listing for leadership monitoring.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTasks.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No tasks found for this month.</TableCell></TableRow>
                ) : (
                  visibleTasks.map((task) => (
                    <TableRow key={task.id ?? task.serialNumber}>
                      <TableCell>
                        <div className="font-medium">{task.taskTitle}</div>
                        <div className="text-xs text-muted-foreground">{task.taskDescription}</div>
                      </TableCell>
                      <TableCell>{task.unit}</TableCell>
                      <TableCell>{task.assignee}</TableCell>
                      <TableCell><Badge variant={statusVariant[task.status]}>{task.status}</Badge></TableCell>
                      <TableCell>{task.dueDate}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
