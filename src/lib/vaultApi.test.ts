import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { backend } = await import("@/test/mocks/backend");
  return { supabase: backend.client };
});

import { backend } from "@/test/mocks/backend";
import {
  createNote,
  createRecord,
  deleteFile,
  deleteNote,
  deleteRecord,
  listCollections,
  listFiles,
  listNotes,
  listRecords,
  updateNote,
  uploadFile,
} from "@/lib/vaultApi";

const USER_ID = "user-uuid";

beforeEach(() => {
  backend.reset();
  backend.signedInAs(USER_ID);
});

describe("vault notes", () => {
  it("lists shared notes newest-updated first", async () => {
    backend.queue("vault_notes", { data: [{ id: "n1" }] });
    const notes = await listNotes();
    expect(backend.for("vault_notes")[0].argsFor("order")).toEqual([
      "updated_at",
      { ascending: false },
    ]);
    expect(notes).toHaveLength(1);
  });

  it("stamps the creating user as owner", async () => {
    backend.queue("vault_notes", { data: { id: "n1" } });
    await createNote({ title: "T", content: "C", tags: ["a"] });
    const [payload] = backend.for("vault_notes")[0].argsFor("insert") as [Record<string, unknown>];
    expect(payload.created_by).toBe(USER_ID);
    expect(payload).toMatchObject({ title: "T", content: "C", tags: ["a"] });
  });

  it("rejects an anonymous create at the backend rather than writing a null owner", async () => {
    backend.signedOut();
    backend.queue("vault_notes", { data: null, error: { message: "new row violates row-level security policy" } });

    await expect(createNote({ title: "T", content: "", tags: [] })).rejects.toThrow(/row-level security/);
    const [payload] = backend.for("vault_notes")[0].argsFor("insert") as [Record<string, unknown>];
    expect(payload.created_by).toBeNull();
  });

  it("surfaces a permission error when editing someone else's note", async () => {
    backend.queue("vault_notes", { data: null, error: { message: "permission denied" } });
    await expect(updateNote("n2", { title: "x", content: "", tags: [] })).rejects.toThrow(
      "permission denied",
    );
  });

  it("scopes deletes to the requested id and surfaces refusals", async () => {
    backend.queue("vault_notes", { data: null, error: { message: "permission denied" } });
    await expect(deleteNote("n2")).rejects.toThrow("permission denied");
    const q = backend.for("vault_notes")[0];
    expect(q.called("delete")).toBe(true);
    expect(q.called("eq", "id", "n2")).toBe(true);
  });
});

describe("vault records", () => {
  it("filters by collection only when one is given", async () => {
    backend.queue("vault_records", { data: [] });
    await listRecords();
    expect(backend.for("vault_records")[0].called("eq")).toBe(false);

    backend.queue("vault_records", { data: [] });
    await listRecords("Budgets");
    expect(backend.for("vault_records")[1].called("eq", "collection", "Budgets")).toBe(true);
  });

  it("derives a sorted, de-duplicated collection list", async () => {
    backend.queue("vault_records", {
      data: [{ collection: "Reports" }, { collection: "Budgets" }, { collection: "Reports" }],
    });
    await expect(listCollections()).resolves.toEqual(["Budgets", "Reports"]);
  });

  it("stamps the creating user as owner", async () => {
    backend.queue("vault_records", { data: { id: "r1" } });
    await createRecord({ collection: "Budgets", title: "Q1", data: { amount: 5 } });
    const [payload] = backend.for("vault_records")[0].argsFor("insert") as [Record<string, unknown>];
    expect(payload).toMatchObject({ collection: "Budgets", title: "Q1", created_by: USER_ID });
  });

  it("surfaces a permission error when deleting another user's record", async () => {
    backend.queue("vault_records", { data: null, error: { message: "permission denied" } });
    await expect(deleteRecord("r2")).rejects.toThrow("permission denied");
  });
});

describe("vault files", () => {
  it("lists files newest first", async () => {
    backend.queue("vault_files", { data: [] });
    await listFiles();
    expect(backend.for("vault_files")[0].argsFor("order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
  });

  it("uploads under a user-scoped path and records the owner", async () => {
    backend.queue("vault_files", { data: { id: "f1" } });
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });

    await uploadFile(file, "/Reports/", "Quarterly");

    const [path] = backend.bucket("vault-files").upload.mock.calls[0] as unknown as [string];
    expect(path.startsWith(`${USER_ID}/Reports/`)).toBe(true);
    expect(path.endsWith("-notes.pdf")).toBe(true);

    const [payload] = backend.for("vault_files")[0].argsFor("insert") as [Record<string, unknown>];
    expect(payload).toMatchObject({
      folder: "Reports",
      file_name: "notes.pdf",
      content_type: "application/pdf",
      description: "Quarterly",
      uploaded_by: USER_ID,
    });
  });

  it("does not write a metadata row when the storage upload fails", async () => {
    backend.bucket("vault-files").upload.mockResolvedValue({
      data: null,
      error: { message: "storage denied" },
    } as never);
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });

    await expect(uploadFile(file, "", "")).rejects.toThrow("storage denied");
    expect(backend.for("vault_files")).toHaveLength(0);
  });

  it("removes the stored object and the row on delete, and surfaces refusals", async () => {
    backend.queue("vault_files", { data: null, error: { message: "permission denied" } });
    const row = { id: "f2", file_path: "other-user/x.pdf", file_name: "x.pdf" } as never;

    await expect(deleteFile(row)).rejects.toThrow("permission denied");
    expect(backend.bucket("vault-files").remove).toHaveBeenCalledWith(["other-user/x.pdf"]);
    expect(backend.for("vault_files")[0].called("eq", "id", "f2")).toBe(true);
  });
});
