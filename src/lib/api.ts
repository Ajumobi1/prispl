import { supabase } from "@/integrations/supabase/client";
import { PRSTask, TaskPriority, TaskStatus, UnitName } from "./task-types";

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  filePath: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface CreateTaskPayload {
  unit: UnitName;
  taskTitle: string;
  taskDescription: string;
  assignee: string;
  dateAssigned: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  deliverable: string;
  checklist: string;
  remarks: string;
}

function downloadBlob(content: string, contentType: string, filename: string): void {
  const blob = new Blob([content], { type: contentType });
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(blobUrl);
}

function asCsv(tasks: PRSTask[]): string {
  const headers = [
    "S/N", "Unit", "Task", "Description", "Assignee",
    "Start Date", "End Date", "Status", "Priority",
    "Deliverable", "Checklist", "Remarks",
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = tasks.map((task) => [
    String(task.serialNumber), task.unit, task.taskTitle,
    task.taskDescription, task.assignee, task.dateAssigned,
    task.dueDate, task.status, task.priority,
    task.deliverable, task.checklist, task.remarks,
  ]);
  return [headers, ...rows].map((row) => row.map((cell) => escape(cell ?? "")).join(",")).join("\n");
}

function rowToTask(row: any): PRSTask {
  return {
    id: row.id,
    serialNumber: row.serial_number,
    unit: row.unit as UnitName,
    taskTitle: row.task_title,
    taskDescription: row.task_description,
    assignee: row.assignee,
    dateAssigned: row.date_assigned,
    dueDate: row.due_date,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    deliverable: row.deliverable,
    checklist: row.checklist,
    remarks: row.remarks,
  };
}

export async function fetchTasks(): Promise<PRSTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("serial_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTask);
}

export async function createTask(payload: CreateTaskPayload): Promise<PRSTask> {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      unit: payload.unit,
      task_title: payload.taskTitle,
      task_description: payload.taskDescription,
      assignee: payload.assignee,
      date_assigned: payload.dateAssigned,
      due_date: payload.dueDate,
      status: payload.status,
      priority: payload.priority,
      deliverable: payload.deliverable,
      checklist: payload.checklist,
      remarks: payload.remarks,
      created_by: session?.user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToTask(data);
}

export async function updateTask(taskId: string, payload: CreateTaskPayload): Promise<PRSTask> {
  const { data, error } = await supabase
    .from("tasks")
    .update({
      unit: payload.unit,
      task_title: payload.taskTitle,
      task_description: payload.taskDescription,
      assignee: payload.assignee,
      date_assigned: payload.dateAssigned,
      due_date: payload.dueDate,
      status: payload.status,
      priority: payload.priority,
      deliverable: payload.deliverable,
      checklist: payload.checklist,
      remarks: payload.remarks,
    })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToTask(data);
}

export async function downloadTasks(format: "csv" | "xlsx" | "pdf"): Promise<void> {
  const tasks = await fetchTasks();
  const now = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    downloadBlob(asCsv(tasks), "text/csv;charset=utf-8", `prs-task-tracker-${now}.csv`);
    return;
  }
  if (format === "xlsx") {
    downloadBlob(asCsv(tasks), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `prs-task-tracker-${now}.xlsx`);
    return;
  }
  const pdfLike = [
    "PRS Task Tracker", "",
    ...tasks.map((t) => `${t.serialNumber}. ${t.taskTitle} | ${t.unit} | ${t.assignee} | ${t.status} | ${t.dueDate}`),
  ].join("\n");
  downloadBlob(pdfLike, "application/pdf", `prs-task-tracker-${now}.pdf`);
}

export async function uploadTaskAttachments(taskId: string, files: File[]): Promise<TaskAttachment[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const results: TaskAttachment[] = [];

  for (const file of files) {
    const filePath = `${taskId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(filePath, file);

    if (uploadError) throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);

    const { data, error } = await supabase
      .from("task_attachments")
      .insert({
        task_id: taskId,
        file_name: file.name,
        file_path: filePath,
        content_type: file.type || "application/octet-stream",
        file_size: file.size,
        uploaded_by: session?.user?.id ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    results.push({
      id: data.id,
      taskId: data.task_id,
      fileName: data.file_name,
      filePath: data.file_path,
      contentType: data.content_type,
      fileSize: Number(data.file_size),
      uploadedAt: data.created_at,
    });
  }

  return results;
}

export async function fetchTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from("task_attachments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((a: any) => ({
    id: a.id,
    taskId: a.task_id,
    fileName: a.file_name,
    filePath: a.file_path,
    contentType: a.content_type,
    fileSize: Number(a.file_size),
    uploadedAt: a.created_at,
  }));
}

export function getTaskAttachmentDownloadUrl(_taskId: string, _attachmentId: string): string {
  // We need to look up the file_path; this is a sync function so we return a placeholder
  // The actual download should be handled differently
  return "#";
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(filePath, 3600);

  return data?.signedUrl ?? "#";
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string): Promise<void> {
  // Get the file path first
  const { data: attachment } = await supabase
    .from("task_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .eq("task_id", taskId)
    .single();

  if (attachment?.file_path) {
    await supabase.storage
      .from("task-attachments")
      .remove([attachment.file_path]);
  }

  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("task_id", taskId);

  if (error) throw new Error(error.message);
}
