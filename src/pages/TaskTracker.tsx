import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  createTask,
  deleteTaskAttachment,
  downloadTasks,
  fetchTaskAttachments,
  fetchTasks,
  downloadAttachment,
  getAttachmentUrl,
  TaskAttachment,
  updateTask,
  uploadTaskAttachments,
} from "@/lib/api";
import { getCurrentSession, logoutSession } from "@/lib/authApi";
import { PRSTask, TaskPriority, TaskStatus, statusColumns, UnitName } from "@/lib/task-types";

const priorities: TaskPriority[] = ["Urgent/High", "Medium", "Low"];

const priorityClasses: Record<TaskPriority, string> = {
  "Urgent/High": "bg-destructive/10 text-destructive border-destructive/20",
  Medium: "bg-accent text-accent-foreground border-accent",
  Low: "bg-secondary text-secondary-foreground border-secondary",
};

const statusVariant: Record<TaskStatus, "secondary" | "default" | "destructive" | "outline"> = {
  "Not Started": "secondary",
  "In Progress": "default",
  "Awaiting Review": "outline",
  Completed: "secondary",
  Delayed: "destructive",
};

type ViewMode = "table" | "kanban";

export default function TaskTrackerPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [tasks, setTasks] = useState<PRSTask[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [customMonths, setCustomMonths] = useState<string[]>([]);
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [newMonthInput, setNewMonthInput] = useState(new Date().toISOString().slice(0, 7));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [taskUploads, setTaskUploads] = useState<Record<string, TaskAttachment[]>>({});
  const [uploadQueueByTask, setUploadQueueByTask] = useState<Record<string, File[]>>({});
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PRSTask | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    unit: "Planning",
    taskTitle: "",
    taskDescription: "",
    assignee: "",
    dateAssigned: "",
    dueDate: "",
    status: "Not Started",
    priority: "Medium",
    deliverable: "",
    checklist: "",
    remarks: "",
  });

  const getTaskKey = (task: PRSTask) => task.id ?? `sn-${task.serialNumber}`;

  const groupedByStatus = useMemo(() => {
    const monthTasks = tasks.filter((t) => t.dateAssigned.startsWith(selectedMonth));
    return statusColumns.reduce<Record<TaskStatus, PRSTask[]>>((acc, status) => {
      acc[status] = monthTasks.filter((t) => t.status === status);
      return acc;
    }, {} as Record<TaskStatus, PRSTask[]>);
  }, [tasks, selectedMonth]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.dateAssigned.startsWith(selectedMonth)),
    [tasks, selectedMonth]
  );

  const monthTabs = useMemo(() => {
    const fromTasks = tasks.map((t) => t.dateAssigned.slice(0, 7)).filter(Boolean);
    const merged = Array.from(new Set([...customMonths, ...fromTasks, selectedMonth]));
    return merged.filter((m) => !closedMonths.includes(m)).sort((a, b) => b.localeCompare(a));
  }, [customMonths, tasks, selectedMonth, closedMonths]);

  const formatMonthLabel = (month: string) => {
    const [year, monthPart] = month.split("-");
    const monthIndex = Number(monthPart) - 1;
    const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex] ?? monthPart;
    return `${monthName} ${year}`;
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("prisp.taskTracker.monthTabs");
      const storedClosed = localStorage.getItem("prisp.taskTracker.closedMonths");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) setCustomMonths(parsed.filter((m) => /^\d{4}-\d{2}$/.test(m)));
      }
      if (storedClosed) {
        const parsedClosed = JSON.parse(storedClosed) as string[];
        if (Array.isArray(parsedClosed)) setClosedMonths(parsedClosed.filter((m) => /^\d{4}-\d{2}$/.test(m)));
      }
    } catch { /* no-op */ }

    const loadTasks = async () => {
      try {
        const session = await getCurrentSession();
        if (!session) {
          navigate("/login?next=/task-tracker", { replace: true });
          return;
        }
        setError(null);
        const remoteTasks = await fetchTasks();
        setTasks(remoteTasks);
        const attachmentPairs = await Promise.all(
          remoteTasks.map(async (task) => {
            const taskKey = task.id ?? `sn-${task.serialNumber}`;
            if (!task.id) return [taskKey, []] as const;
            const attachments = await fetchTaskAttachments(task.id);
            return [taskKey, attachments] as const;
          })
        );
        setTaskUploads(Object.fromEntries(attachmentPairs));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load tracker data.";
        setError(message);
      } finally {
        setAuthChecked(true);
      }
    };
    loadTasks();
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem("prisp.taskTracker.monthTabs", JSON.stringify(customMonths));
  }, [customMonths]);

  useEffect(() => {
    localStorage.setItem("prisp.taskTracker.closedMonths", JSON.stringify(closedMonths));
  }, [closedMonths]);

  if (!authChecked) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading tracker...</div>;
  }

  const addMonthTab = () => {
    if (!/^\d{4}-\d{2}$/.test(newMonthInput)) { setError("Select a valid month."); return; }
    setCustomMonths((prev) => (prev.includes(newMonthInput) ? prev : [...prev, newMonthInput]));
    setClosedMonths((prev) => prev.filter((m) => m !== newMonthInput));
    setSelectedMonth(newMonthInput);
    setError(null);
  };

  const closeMonthTab = (month: string) => {
    if (!window.confirm("Are you sure you want to close the entire month?")) return;
    setClosedMonths((prev) => (prev.includes(month) ? prev : [...prev, month]));
    if (selectedMonth === month) {
      const fallback = monthTabs.find((e) => e !== month) ?? new Date().toISOString().slice(0, 7);
      setSelectedMonth(fallback);
    }
    setError(`Month ${formatMonthLabel(month)} is closed. You can reopen it anytime below.`);
  };

  const reopenMonthTab = (month: string) => {
    setClosedMonths((prev) => prev.filter((e) => e !== month));
    setSelectedMonth(month);
    setError(null);
  };

  const addAssignee = () => {
    const candidate = assigneeInput.trim();
    if (!candidate) return;
    setSelectedAssignees((prev) => prev.includes(candidate) ? prev : [...prev, candidate]);
    setAssigneeInput("");
  };

  const removeAssignee = (assignee: string) => {
    setSelectedAssignees((prev) => prev.filter((i) => i !== assignee));
  };

  const onAddTask = async () => {
    const normalizedTaskTitle = form.taskTitle.trim();
    const monthStartDefault = `${selectedMonth}-01`;
    const resolvedDateAssigned = form.dateAssigned || monthStartDefault;
    const resolvedDueDate = form.dueDate || resolvedDateAssigned;

    if (!normalizedTaskTitle || selectedAssignees.length === 0) {
      setError("Task, Assignees, Priority, and Status are required.");
      return;
    }

    if (resolvedDueDate < resolvedDateAssigned) {
      setError("End Date cannot be earlier than Start Date.");
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      const joinedAssignees = selectedAssignees.join(", ");
      const createdTask = await createTask({
        unit: form.unit as UnitName,
        taskTitle: normalizedTaskTitle,
        taskDescription: form.taskDescription.trim() || normalizedTaskTitle,
        assignee: joinedAssignees,
        dateAssigned: resolvedDateAssigned,
        dueDate: resolvedDueDate,
        status: form.status as TaskStatus,
        priority: form.priority as TaskPriority,
        deliverable: "",
        checklist: form.checklist,
        remarks: form.remarks,
      });
      setTasks((prev) => [...prev, createdTask]);

      if (uploadQueue.length > 0 && createdTask.id) {
        const uploadedAttachments = await uploadTaskAttachments(createdTask.id, uploadQueue);
        setTaskUploads((prev) => ({ ...prev, [getTaskKey(createdTask)]: uploadedAttachments }));
      } else {
        setTaskUploads((prev) => ({ ...prev, [getTaskKey(createdTask)]: [] }));
      }

      setForm({
        unit: "Planning", taskTitle: "", taskDescription: "", assignee: "",
        dateAssigned: monthStartDefault, dueDate: monthStartDefault,
        status: "Not Started", priority: "Medium", deliverable: "", checklist: "", remarks: "",
      });
      setSelectedAssignees([]);
      setAssigneeInput("");
      setUploadQueue([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create task.";
      setError(message);
    } finally {
      setIsBusy(false);
    }
  };

  const onDownloadEverything = async () => {
    try {
      setIsBusy(true);
      setError(null);
      await downloadTasks("csv");
    } catch {
      setError("Download failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const beginEditTask = (task: PRSTask) => {
    setEditingTaskId(getTaskKey(task));
    setEditDraft({ ...task });
    setError(null);
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setEditDraft(null);
  };

  const saveEditTask = async (task: PRSTask) => {
    if (!task.id || !editDraft) return;

    const normalizedTitle = editDraft.taskTitle.trim();
    const normalizedAssignee = editDraft.assignee.trim();
    const todayIso = new Date().toISOString().split("T")[0];
    const resolvedStart = editDraft.dateAssigned || todayIso;
    const resolvedEnd = editDraft.dueDate || resolvedStart;

    if (!normalizedTitle || !normalizedAssignee) {
      setError("Task and Assignees are required while editing.");
      return;
    }

    if (resolvedEnd < resolvedStart) {
      setError("End Date cannot be earlier than Start Date.");
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      const updated = await updateTask(task.id, {
        unit: editDraft.unit,
        taskTitle: normalizedTitle,
        taskDescription: editDraft.taskDescription.trim() || normalizedTitle,
        assignee: normalizedAssignee,
        dateAssigned: resolvedStart,
        dueDate: resolvedEnd,
        status: editDraft.status,
        priority: editDraft.priority,
        deliverable: editDraft.deliverable,
        checklist: editDraft.checklist,
        remarks: editDraft.remarks,
      });
      setTasks((prev) => prev.map((item) => (getTaskKey(item) === getTaskKey(task) ? updated : item)));
      setEditingTaskId(null);
      setEditDraft(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update task.";
      setError(message);
    } finally {
      setIsBusy(false);
    }
  };

  const onDeleteAttachment = async (task: PRSTask, attachment: TaskAttachment) => {
    if (!task.id) return;
    if (!window.confirm(`Remove attachment "${attachment.fileName}"?`)) return;
    try {
      setDeletingAttachmentId(attachment.id);
      setError(null);
      await deleteTaskAttachment(task.id, attachment.id);
      setTaskUploads((prev) => ({
        ...prev,
        [getTaskKey(task)]: (prev[getTaskKey(task)] ?? []).filter((i) => i.id !== attachment.id),
      }));
    } catch {
      setError("Failed to delete attachment.");
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const uploadAttachmentsLater = async (task: PRSTask) => {
    if (!task.id) return;
    const taskKey = getTaskKey(task);
    const queued = uploadQueueByTask[taskKey] ?? [];
    if (queued.length === 0) { setError("Select one or more files before uploading."); return; }
    try {
      setUploadingTaskId(taskKey);
      setError(null);
      const uploaded = await uploadTaskAttachments(task.id, queued);
      setTaskUploads((prev) => ({ ...prev, [taskKey]: [...uploaded, ...(prev[taskKey] ?? [])] }));
      setUploadQueueByTask((prev) => ({ ...prev, [taskKey]: [] }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload task attachments.";
      setError(message);
    } finally {
      setUploadingTaskId(null);
    }
  };

  const logout = async () => {
    await logoutSession();
    navigate("/login");
  };

  const closedMonthTabs = [...closedMonths].sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Unit Task Tracker</h1>
            <p className="text-sm text-muted-foreground">Operational tracker for all departments: Planning, Research, Statistics, and M&E.</p>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("table")}>Table View</Button>
            <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("kanban")} disabled={isBusy}>Kanban</Button>
            <Button variant="outline" size="sm" onClick={onDownloadEverything} disabled={isBusy}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4">
        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {/* Month Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {monthTabs.map((month) => (
            <div key={month} className="flex items-center gap-1">
              <Button
                variant={selectedMonth === month ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedMonth(month)}
              >
                {formatMonthLabel(month)}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs text-muted-foreground" onClick={() => closeMonthTab(month)}>×</Button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <Input type="month" value={newMonthInput} onChange={(e) => setNewMonthInput(e.target.value)} className="h-8 w-36" />
            <Button size="sm" variant="outline" onClick={addMonthTab}>+ Month</Button>
          </div>
        </div>

        {closedMonthTabs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Closed:</span>
            {closedMonthTabs.map((month) => (
              <Button key={month} variant="ghost" size="sm" className="text-xs" onClick={() => reopenMonthTab(month)}>
                ↩ {formatMonthLabel(month)}
              </Button>
            ))}
          </div>
        )}

        {/* Add New Task */}
        <Card>
          <CardHeader>
            <CardTitle>Add New Task</CardTitle>
            <CardDescription>Required: Task, Assignees, Status, Priority. Current sheet: {formatMonthLabel(selectedMonth)}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Task Title" value={form.taskTitle} onChange={(e) => setForm((p) => ({ ...p, taskTitle: e.target.value }))} />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Assignees</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Type name and press Enter"
                  value={assigneeInput}
                  onChange={(e) => setAssigneeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAssignee(); } }}
                />
                <Button variant="outline" size="sm" onClick={addAssignee}>Add</Button>
              </div>
              {selectedAssignees.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedAssignees.map((a) => (
                    <Badge key={a} variant="secondary" className="cursor-pointer" onClick={() => removeAssignee(a)}>
                      {a} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Select value={form.unit} onValueChange={(v) => setForm((p) => ({ ...p, unit: v }))}>
                <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>
                  {(["Planning", "Research", "Statistics", "M&E"] as UnitName[]).map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {statusColumns.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="date" value={form.dateAssigned} onChange={(e) => setForm((p) => ({ ...p, dateAssigned: e.target.value }))} />
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>

            <Textarea placeholder="Description (optional)" value={form.taskDescription} onChange={(e) => setForm((p) => ({ ...p, taskDescription: e.target.value }))} />
            <Input placeholder="Checklist (optional)" value={form.checklist} onChange={(e) => setForm((p) => ({ ...p, checklist: e.target.value }))} />
            <Input placeholder="Remarks (optional)" value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />

            <div>
              <label className="text-sm font-medium text-foreground">Attachments</label>
              <Input
                type="file"
                multiple
                onChange={(e) => setUploadQueue(Array.from(e.target.files ?? []))}
              />
            </div>

            <Button onClick={onAddTask} disabled={isBusy}>
              {isBusy ? "Creating..." : "Create Task"}
            </Button>
          </CardContent>
        </Card>

        {/* Table View */}
        {viewMode === "table" && (
          <Card>
            <CardHeader><CardTitle>Tasks — {formatMonthLabel(selectedMonth)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTasks.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No tasks for this month.</TableCell></TableRow>
                  ) : (
                    visibleTasks.map((task) => {
                      const taskKey = getTaskKey(task);
                      const isEditing = editingTaskId === taskKey;
                      const attachments = taskUploads[taskKey] ?? [];

                      return (
                        <TableRow key={taskKey}>
                          <TableCell>{task.serialNumber}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input value={editDraft?.taskTitle ?? ""} onChange={(e) => setEditDraft((d) => d ? { ...d, taskTitle: e.target.value } : d)} />
                            ) : (
                              <div>
                                <div className="font-medium">{task.taskTitle}</div>
                                <div className="text-xs text-muted-foreground">{task.taskDescription}</div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Select value={editDraft?.unit} onValueChange={(v) => setEditDraft((d) => d ? { ...d, unit: v as UnitName } : d)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(["Planning", "Research", "Statistics", "M&E"] as UnitName[]).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : task.unit}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input value={editDraft?.assignee ?? ""} onChange={(e) => setEditDraft((d) => d ? { ...d, assignee: e.target.value } : d)} />
                            ) : task.assignee}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Select value={editDraft?.status} onValueChange={(v) => setEditDraft((d) => d ? { ...d, status: v as TaskStatus } : d)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {statusColumns.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={statusVariant[task.status]}>{task.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Select value={editDraft?.priority} onValueChange={(v) => setEditDraft((d) => d ? { ...d, priority: v as TaskPriority } : d)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${priorityClasses[task.priority]}`}>{task.priority}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input type="date" value={editDraft?.dateAssigned} onChange={(e) => setEditDraft((d) => d ? { ...d, dateAssigned: e.target.value } : d)} />
                            ) : task.dateAssigned}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input type="date" value={editDraft?.dueDate} onChange={(e) => setEditDraft((d) => d ? { ...d, dueDate: e.target.value } : d)} />
                            ) : task.dueDate}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <Button size="sm" onClick={() => saveEditTask(task)} disabled={isBusy}>Save</Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEditTask}>Cancel</Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => beginEditTask(task)}>Edit</Button>
                              )}
                              {attachments.length > 0 && (
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button size="sm" variant="ghost" className="text-xs">{attachments.length} file(s)</Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="space-y-1 pt-1">
                                    {attachments.map((att) => (
                                      <div key={att.id} className="flex items-center gap-1 text-xs">
                                        <button
                                          className="text-primary underline text-xs"
                                          onClick={async () => {
                                            if (att.filePath) {
                                              try {
                                                await downloadAttachment(att.filePath, att.fileName);
                                              } catch (e: any) {
                                                toast({ title: "Download failed", description: e.message, variant: "destructive" });
                                              }
                                            }
                                          }}
                                        >
                                          {att.fileName}
                                        </button>
                                        <Button size="sm" variant="ghost" className="h-5 px-1 text-xs text-destructive" onClick={() => onDeleteAttachment(task, att)} disabled={deletingAttachmentId === att.id}>×</Button>
                                      </div>
                                    ))}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                              <div className="flex items-center gap-1">
                                <Input
                                  type="file"
                                  multiple
                                  className="h-7 text-xs"
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files ?? []);
                                    setUploadQueueByTask((prev) => ({ ...prev, [taskKey]: files }));
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs"
                                  onClick={() => uploadAttachmentsLater(task)}
                                  disabled={uploadingTaskId === taskKey}
                                >
                                  Upload
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Kanban View */}
        {viewMode === "kanban" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {statusColumns.map((status) => (
              <Card key={status}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{status}</CardTitle>
                  <CardDescription>{(groupedByStatus[status] ?? []).length} tasks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(groupedByStatus[status] ?? []).map((task) => (
                    <div key={getTaskKey(task)} className="rounded-md border bg-card p-2 text-sm">
                      <div className="font-medium text-foreground">{task.taskTitle}</div>
                      <div className="text-xs text-muted-foreground">{task.unit} · {task.assignee}</div>
                      <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${priorityClasses[task.priority]}`}>{task.priority}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
