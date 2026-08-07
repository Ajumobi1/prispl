import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { backend } = await import("@/test/mocks/backend");
  return { supabase: backend.client };
});

import { backend } from "@/test/mocks/backend";
import {
  fetchDeletedTasks,
  fetchTasks,
  restoreTask,
  deleteTaskAttachment,
} from "@/lib/api";

const USER_ID = "user-uuid";

function taskRow(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    serial_number: 1,
    unit: "Planning",
    task_title: "Write report",
    task_description: "",
    assignee: "Jane",
    date_assigned: "2026-01-01",
    due_date: "2026-01-10",
    status: "Not Started",
    priority: "Medium",
    deliverable: "",
    checklist: "",
    remarks: "",
    created_by: USER_ID,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    deleted_by: null,
    ...over,
  };
}

beforeEach(() => {
  backend.reset();
  backend.signedInAs(USER_ID);
});

describe("fetchTasks (board view)", () => {
  it("excludes trashed tasks at the query level", async () => {
    backend.queue("tasks", { data: [taskRow()] });

    const tasks = await fetchTasks();

    const q = backend.for("tasks")[0];
    expect(q.called("is", "deleted_at", null)).toBe(true);
    expect(q.called("not")).toBe(false);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].deletedAt).toBeNull();
  });

  it("throws when the backend rejects the read", async () => {
    backend.queue("tasks", { data: null, error: { message: "permission denied" } });
    await expect(fetchTasks()).rejects.toThrow("permission denied");
  });
});

describe("fetchDeletedTasks (trash view)", () => {
  it("returns only trashed tasks, newest first", async () => {
    backend.queue("tasks", { data: [taskRow({ deleted_at: "2026-02-01T00:00:00Z" })] });

    const tasks = await fetchDeletedTasks();

    const q = backend.for("tasks")[0];
    expect(q.called("not", "deleted_at", "is", null)).toBe(true);
    expect(q.called("is", "deleted_at", null)).toBe(false);
    expect(q.argsFor("order")).toEqual(["deleted_at", { ascending: false }]);
    expect(tasks[0].deletedAt).toBe("2026-02-01T00:00:00Z");
  });
});

describe("softDeleteTask", () => {
  it("stamps deleted_at/deleted_by instead of removing the row", async () => {
    const { softDeleteTask } = await import("@/lib/api");
    backend.queue("tasks", { data: null });

    await softDeleteTask("t1");

    const q = backend.for("tasks")[0];
    expect(q.called("delete")).toBe(false); // never a hard delete
    const [patch] = q.argsFor("update") as [Record<string, unknown>];
    expect(typeof patch.deleted_at).toBe("string");
    expect(patch.deleted_by).toBe(USER_ID);
    expect(q.called("eq", "id", "t1")).toBe(true);
  });

  it("surfaces the database guard when the caller is not creator or admin", async () => {
    const { softDeleteTask } = await import("@/lib/api");
    backend.queue("tasks", {
      data: null,
      error: { message: "only the task creator or an admin can move a task to trash or restore it" },
    });

    await expect(softDeleteTask("t1")).rejects.toThrow(/only the task creator or an admin/);
  });
});

describe("restoreTask", () => {
  it("clears both trash columns", async () => {
    backend.queue("tasks", { data: null });

    await restoreTask("t1");

    const q = backend.for("tasks")[0];
    expect(q.argsFor("update")).toEqual([{ deleted_at: null, deleted_by: null }]);
    expect(q.called("eq", "id", "t1")).toBe(true);
    expect(q.called("delete")).toBe(false);
  });

  it("surfaces a permission error from the restore guard", async () => {
    backend.queue("tasks", { data: null, error: { message: "not allowed" } });
    await expect(restoreTask("t1")).rejects.toThrow("not allowed");
  });
});

describe("task rows are never hard-deleted from the client", () => {
  it("exposes no permanent-delete helper for tasks", async () => {
    const api = await import("@/lib/api");
    const taskDeleters = Object.keys(api).filter((k) => /permanentlyDelete|hardDelete|purgeTask/.test(k));
    expect(taskDeleters).toEqual([]);
  });
});

describe("deleteTaskAttachment (the one real delete path)", () => {
  it("removes the stored object and the metadata row, scoped to the task", async () => {
    backend.queue("task_attachments", { data: { file_path: "u/1-file.pdf" } });
    backend.queue("task_attachments", { data: null });

    await deleteTaskAttachment("t1", "a1");

    expect(backend.bucket("task-attachments").remove).toHaveBeenCalledWith(["u/1-file.pdf"]);
    const del = backend.for("task_attachments")[1];
    expect(del.called("delete")).toBe(true);
    expect(del.called("eq", "id", "a1")).toBe(true);
    expect(del.called("eq", "task_id", "t1")).toBe(true);
  });

  it("throws when the delete is refused", async () => {
    backend.queue("task_attachments", { data: { file_path: "u/1-file.pdf" } });
    backend.queue("task_attachments", { data: null, error: { message: "permission denied" } });

    await expect(deleteTaskAttachment("t1", "a1")).rejects.toThrow("permission denied");
  });
});
