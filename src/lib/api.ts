import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PRSTask, TaskPriority, TaskStatus, UnitName } from "./task-types";

// Re-export from new module for backwards compatibility
export { downloadTasks } from "./exports";

type TaskRow = Tables<"tasks">;
type AttachmentRow = Tables<"task_attachments">;

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

function rowToTask(row: TaskRow): PRSTask {
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

async function getUploaderName(userId: string | undefined): Promise<string> {
  if (!userId) return "Unknown";
  const { data } = await supabase
    .from("profiles")
    .select("full_name, username")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.full_name || data?.username || "Unknown";
}

function fireTelegramBackup(
  payload: Record<string, unknown>,
  userId?: string,
): void {
  // Fire-and-forget so Telegram delivery (and the uploader-name lookup it needs)
  // never blocks the user's create/upload response.
  (async () => {
    try {
      const uploader = await getUploaderName(userId);
      await supabase.functions.invoke("telegram-backup", {
        body: { ...payload, uploader },
      });
    } catch (err) {
      console.warn("Telegram backup failed:", err);
    }
  })();
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
  const task = rowToTask(data);
  fireTelegramBackup({ type: "task", task }, session?.user?.id);
  return task;
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

// downloadTasks is re-exported from ./exports above

export async function uploadTaskAttachments(taskId: string, files: File[]): Promise<TaskAttachment[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const results: TaskAttachment[] = [];
  const uploader = await getUploaderName(session?.user?.id);

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

    fireTelegramBackup({ type: "file", taskId, attachmentId: data.id, uploader });
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

  return (data ?? []).map((a: AttachmentRow) => ({
    id: a.id,
    taskId: a.task_id,
    fileName: a.file_name,
    filePath: a.file_path,
    contentType: a.content_type,
    fileSize: Number(a.file_size),
    uploadedAt: a.created_at,
  }));
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(filePath, 3600);

  if (error) {
    console.error("Failed to create signed URL:", error.message);
    throw new Error(`Failed to get download URL: ${error.message}`);
  }

  return data?.signedUrl ?? "#";
}

export async function downloadAttachment(filePath: string, fileName: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from("task-attachments")
    .download(filePath);

  if (error) throw new Error(`Failed to download: ${error.message}`);

  const url = window.URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
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
