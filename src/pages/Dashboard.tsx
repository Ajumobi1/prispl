import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, ListChecks, Users } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { fetchTasks } from "@/lib/api";
import { PRSTask, TaskStatus, UnitName } from "@/lib/task-types";
import ondoLogo from "@/assets/ondo-state-logo.png";
import odchcLogo from "@/assets/odchc-logo.png";
import UserMenu from "@/components/UserMenu";

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
  const { session } = useAuth();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [tasks, setTasks] = useState<PRSTask[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isAdmin = session?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const data = await fetchTasks();
        if (cancelled) return;
        setTasks(data);
        if (data.length > 0) {
          const months = Array.from(new Set(data.map((t) => t.dateAssigned.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
          setSelectedMonth((prev) => prev || months[0] || new Date().toISOString().slice(0, 7));
        } else {
          setSelectedMonth((prev) => prev || new Date().toISOString().slice(0, 7));
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load dashboard data.";
        setError(message);
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

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
    notStarted: visibleTasks.filter((t) => t.status === "Not Started").length,
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

  if (!sessionChecked) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-2 py-2 sm:px-6 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <div className="rounded-xl bg-white p-1.5 sm:p-2 shadow-lg ring-1 ring-white/40">
                <img src={ondoLogo} alt="Ondo State" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
              </div>
              <div className="rounded-xl bg-white p-1.5 sm:p-2 shadow-lg ring-1 ring-white/40">
                <img src={odchcLogo} alt="ODCHC" className="h-12 w-auto sm:h-16 object-contain" />
              </div>
            </div>
            <div className="min-w-0 flex-1 sm:border-l sm:border-primary-foreground/20 sm:pl-4">
              <h1 className="text-base sm:text-xl font-bold tracking-tight leading-tight">Dashboard</h1>
              <p className="text-[11px] sm:text-xs text-primary-foreground/80 leading-tight">PR&S Unit — Leadership Summary</p>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" asChild><Link to="/task-tracker">Unit Tracker</Link></Button>
            {isAdmin && <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" asChild><Link to="/account-admin">Manage Accounts</Link></Button>}
            <UserMenu variant="header" />
          </nav>

          {/* Mobile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-popover z-50">
              <DropdownMenuLabel>Menu</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/task-tracker"><ListChecks className="mr-2 h-4 w-4" />Unit Tracker</Link></DropdownMenuItem>
              {isAdmin && <DropdownMenuItem asChild><Link to="/account-admin"><Users className="mr-2 h-4 w-4" />Manage Accounts</Link></DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
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

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total", value: byStatus.total },
            { label: "Not Started", value: byStatus.notStarted },
            { label: "In Progress", value: byStatus.inProgress },
            { label: "Awaiting Review", value: byStatus.awaitingReview },
            { label: "Completed", value: byStatus.completed },
            { label: "Delayed", value: byStatus.delayed },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm">
              <CardHeader className="pb-2"><CardDescription>{item.label}</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold text-foreground">{item.value}</p></CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Department Snapshot</CardTitle>
            <CardDescription>Task volume by unit for {formatMonthLabel(selectedMonth)}.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Task Overview</CardTitle>
            <CardDescription>Read-only listing for leadership monitoring.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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
